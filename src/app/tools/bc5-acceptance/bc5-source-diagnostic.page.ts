import { ChangeDetectionStrategy, Component, inject, signal, type OnDestroy, type OnInit } from '@angular/core';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import type { Bc5AcceptanceAdmission } from '../../core/device-v2/ble-direct/bc5-acceptance-client';
import { readBc5RecoveryProfile } from '../../core/device-v2/ble-direct/bc5-launch-profile';
import { bc5PresenceRecoveryStop } from '../../core/device-v2/ble-direct/bc5-registered-presence';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';

const diagnosticTag = 'BC5_SOURCE_PRESENCE_STOP';

@Component({
  selector: 'app-bc5-source-diagnostic', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  template: `
    <ion-header class="tool-page-header"><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/home/device" text="返回" /></ion-buttons>
      <ion-title>蓝牙附近状态诊断</ion-title>
    </ion-toolbar></ion-header>
    <ion-content class="ion-padding">
      <main>
        <p>只读核对原蓝牙卡的附近状态资料，不连接设备、不修改引用或授权。</p>
        @if (profile()) {
          <ion-button expand="block" [disabled]="attempted()" (click)="diagnose()">检查原蓝牙卡附近状态</ion-button>
        }
        <p role="status" aria-atomic="true">{{ status() }}</p>
      </main>
    </ion-content>`,
  styles: [`
    main { max-inline-size: 35rem; margin-inline: auto; overflow-wrap: anywhere; }
    ion-button { min-block-size: 48px; }
    [role="status"] { min-block-size: 3em; }
  `],
})
export class Bc5SourceDiagnosticPage implements OnInit, OnDestroy {
  private readonly ble = inject(DeviceV2BleService);
  private operation?: AbortController;
  private destroyed = false;
  protected readonly profile = signal<Bc5AcceptanceAdmission | undefined>(undefined);
  protected readonly attempted = signal(false);
  protected readonly status = signal('正在核对诊断配置…');

  async ngOnInit(): Promise<void> {
    const profile = await readBc5RecoveryProfile().catch(() => undefined);
    if (this.destroyed) return;
    this.profile.set(profile);
    this.status.set(profile ? '就绪。确认后仅检查原蓝牙卡一次。' : '本次诊断入口不可用，请返回设备列表。');
  }

  protected async diagnose(): Promise<void> {
    const profile = this.profile();
    if (!profile || this.attempted() || this.destroyed) return;
    this.attempted.set(true);
    const owner = this.operation = new AbortController();
    this.status.set('正在只读检查原蓝牙卡…');
    try {
      await this.ble.diagnoseBc5SourcePresence(profile, owner.signal);
      if (!owner.signal.aborted) {
        console.info(diagnosticTag, 'source-presence', 'passed');
        this.status.set('原蓝牙卡附近状态校验通过；不代表设备已在附近或上线。请返回设备列表。');
      }
    } catch (error) {
      if (!owner.signal.aborted) {
        const stop = bc5PresenceRecoveryStop(error);
        const [stage, reason] = stop.stage === 'source-presence' && stop.reason !== 'paired-material'
          ? [stop.stage, stop.reason] : ['outside-presence', 'unclassified'];
        console.warn(diagnosticTag, stage, reason);
        this.status.set(`原蓝牙卡检查未通过：${stage} / ${reason}。请返回设备列表；没有自动重试。`);
      }
    } finally { this.operation = undefined; }
  }

  ionViewWillLeave(): void {
    if (!this.operation) return;
    this.operation.abort();
    this.status.set('已停止等待。请返回设备列表。');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.ionViewWillLeave();
  }
}
