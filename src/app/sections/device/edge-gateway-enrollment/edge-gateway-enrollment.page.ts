import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { BleDirectTarget } from '../../../core/device-v2/ble-direct';
import { BlinkerDevice } from '../../../core/model/device.model';
import { EdgeGatewayTopologyState } from '../../../core/protocol/device-v2';
import { DataService } from '../../../core/services/data.service';
import {
  DeviceV2EdgeGatewayService,
  DeviceV2GatewayCompletion,
  DeviceV2GatewayEnrollment,
  DeviceV2GatewayRecovery,
} from '../../../core/services/device-v2-edge-gateway.service';
import { UserService } from '../../../core/services/user.service';

type EnrollmentPhase =
  | 'idle'
  | 'discovering'
  | 'selecting'
  | 'enrolling'
  | 'resuming'
  | 'waiting'
  | 'ready'
  | 'failed';

@Component({
  selector: 'app-edge-gateway-enrollment',
  standalone: true,
  imports: [IonicModule, FormsModule],
  templateUrl: './edge-gateway-enrollment.page.html',
  styleUrls: ['./edge-gateway-enrollment.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EdgeGatewayEnrollmentPage implements OnDestroy {
  edgeHubLogicalDeviceId = '';
  hub?: BlinkerDevice;
  deviceName = '';
  phase: EnrollmentPhase = 'idle';
  candidates: readonly BleDirectTarget[] = [];
  recoveries: readonly DeviceV2GatewayRecovery[] = [];
  logicalDeviceId = '';
  error = '';

  private workflow?: DeviceV2GatewayEnrollment;
  private generation = 0;
  private readonly subscriptions = new Subscription();

  constructor(
    route: ActivatedRoute,
    private readonly data: DataService,
    private readonly gateway: DeviceV2EdgeGatewayService,
    private readonly users: UserService,
    private readonly nav: NavController,
    private readonly cd: ChangeDetectorRef,
  ) {
    this.subscriptions.add(route.paramMap.subscribe(params => {
      this.edgeHubLogicalDeviceId = params.get('id') ?? '';
      this.bindHub();
    }));
    this.subscriptions.add(this.data.deviceDataLoader.subscribe(loaded => {
      if (loaded) this.bindHub();
    }));
  }

  get busy(): boolean {
    return this.phase === 'discovering'
      || this.phase === 'enrolling'
      || this.phase === 'resuming';
  }

  get available(): boolean {
    return !!this.hub
      && this.hub.deviceType === 'edge-hub'
      && !this.hub.config.isShared;
  }

  ionViewWillEnter(): void {
    if (!this.data.auth?.accessToken) {
      void this.nav.navigateRoot('/login');
      return;
    }
    void this.loadRecoveries();
  }

  async startDiscovery(): Promise<void> {
    if (!this.available || this.busy) return;
    const generation = ++this.generation;
    await this.closeWorkflow();
    this.phase = 'discovering';
    this.error = '';
    this.candidates = [];
    this.cd.markForCheck();
    try {
      const workflow = await this.gateway.beginEnrollment(this.edgeHubLogicalDeviceId);
      if (generation !== this.generation) {
        await workflow.cancel();
        return;
      }
      this.workflow = workflow;
      this.candidates = [...workflow.candidates].sort(
        (left, right) => (right.rssi ?? -127) - (left.rssi ?? -127),
      );
      if (!this.candidates.length) {
        await this.closeWorkflow();
        throw new Error('BLE_DIRECT_SCAN_TIMEOUT');
      }
      this.phase = 'selecting';
    } catch (error) {
      this.fail(generation, error);
    } finally {
      this.cd.markForCheck();
    }
  }

  async selectCandidate(target: BleDirectTarget): Promise<void> {
    const workflow = this.workflow;
    if (!workflow || this.phase !== 'selecting') return;
    const generation = this.generation;
    this.phase = 'enrolling';
    this.error = '';
    this.cd.markForCheck();
    try {
      const result = await workflow.enrollAndAttach(target, {
        displayName: this.deviceName.trim() || 'Blinker 蓝牙设备',
      });
      if (generation !== this.generation) return;
      this.workflow = undefined;
      await this.accept(result);
    } catch (error) {
      this.workflow = undefined;
      this.fail(generation, error);
      await this.loadRecoveries();
    }
  }

  async resume(recovery: DeviceV2GatewayRecovery): Promise<void> {
    if (!this.available || this.busy) return;
    const generation = ++this.generation;
    await this.closeWorkflow();
    this.phase = 'resuming';
    this.error = '';
    this.cd.markForCheck();
    try {
      const result = await this.gateway.resumeRecovery(
        this.edgeHubLogicalDeviceId, recovery,
      );
      if (generation !== this.generation) return;
      await this.accept(result);
    } catch (error) {
      this.fail(generation, error);
      await this.loadRecoveries();
    }
  }

  async refreshRecoveries(): Promise<void> {
    if (this.busy) return;
    await this.loadRecoveries();
  }

  async continueWaiting(): Promise<void> {
    if (this.busy || !this.logicalDeviceId) return;
    await this.loadRecoveries();
    const recovery = this.recoveries.find(
      value => value.logicalDeviceId === this.logicalDeviceId,
    );
    if (recovery) await this.resume(recovery);
    else this.error = '未找到待确认任务，请重新进入本页后重试';
    this.cd.markForCheck();
  }

  candidateCode(target: BleDirectTarget): string {
    return [...target.profile.modeLocator.slice(-4)]
      .map(value => value.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
  }

  recoveryLabel(recovery: DeviceV2GatewayRecovery): string {
    return recovery.stage === 'finish_enrollment'
      ? '完成设备认领' : '完成网关绑定';
  }

  async finish(): Promise<void> {
    if (!this.logicalDeviceId) return;
    await this.users.getAllInfo().catch(() => false);
    await this.nav.navigateRoot(`/device/${encodeURIComponent(this.logicalDeviceId)}`);
  }

  ionViewWillLeave(): void {
    this.generation += 1;
    void this.closeWorkflow();
  }

  ngOnDestroy(): void {
    this.generation += 1;
    this.subscriptions.unsubscribe();
    void this.closeWorkflow();
  }

  private bindHub(): void {
    this.hub = this.data.getDevice(this.edgeHubLogicalDeviceId);
    this.cd.markForCheck();
  }

  private async loadRecoveries(): Promise<void> {
    if (!this.available) {
      this.recoveries = [];
      this.cd.markForCheck();
      return;
    }
    try {
      this.recoveries = await this.gateway.recoveries(this.edgeHubLogicalDeviceId);
    } catch (error) {
      this.error ||= this.messageOf(error);
    } finally {
      this.cd.markForCheck();
    }
  }

  private async accept(result: DeviceV2GatewayCompletion): Promise<void> {
    this.logicalDeviceId = result.logicalDeviceId;
    this.phase = result.attachment.topology.topologyState === EdgeGatewayTopologyState.Active
      ? 'ready' : 'waiting';
    this.candidates = [];
    await this.loadRecoveries();
  }

  private async closeWorkflow(): Promise<void> {
    const workflow = this.workflow;
    this.workflow = undefined;
    if (workflow) await workflow.cancel().catch(() => undefined);
  }

  private fail(generation: number, error: unknown): void {
    if (generation !== this.generation) return;
    this.phase = 'failed';
    this.candidates = [];
    this.error = this.messageOf(error);
    this.cd.markForCheck();
  }

  private messageOf(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    if (code === 'BLE_DIRECT_SCAN_TIMEOUT' || code === 'BLE_DIRECT_SCAN_FAILED') {
      return '网关附近没有发现处于接入模式的 Blinker 蓝牙设备';
    }
    if (code === 'EDGE_GATEWAY_RECOVERY_NOT_FOUND') return '该恢复任务已经完成或失效';
    if (code.includes('PERMIT_JOIN_BUSY')) return '网关正在处理另一台设备，请稍后重试';
    return code || '接入失败，请确认网关和蓝牙设备均在线';
  }
}
