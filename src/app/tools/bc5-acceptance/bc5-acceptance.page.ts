import { ChangeDetectionStrategy, Component, inject, signal, type OnDestroy, type OnInit } from '@angular/core';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import type { Bc5AcceptanceAdmission } from '../../core/device-v2/ble-direct/bc5-acceptance-client';
import type { Bc5AcceptanceStage } from '../../core/device-v2/ble-direct/bc5-acceptance-run';
import { readBc5LaunchProfile, readBc5RecoveryProfile } from '../../core/device-v2/ble-direct/bc5-launch-profile';
import { readInitialNetworkLaunchProfile } from '../../core/device-v2/ble-direct/initial-network-launch-profile';
import type { InitialNetworkAdmission } from '../../core/device-v2/ble-direct/initial-network-checkpoint';
import { InitialNetworkPreflightStop, type InitialNetworkStage } from '../../core/device-v2/ble-direct/initial-network-run';
import { InitialCloudWifiContinuation } from '../../core/device-v2/provisioning/wifiprov-initial-cloud-carrier';
import { DeviceV2BleService } from '../../core/services/device-v2-ble.service';
import { DeviceV2ManagementService } from '../../core/services/device-v2-management.service';

const stageText: Record<Bc5AcceptanceStage, string> = {
  preflight: '核对原 BLE 授权及测试入口…', install: '等待设备确认 Key 安装…',
  activation: '设备已确认安装，正在确认云卡激活…', wifi: '云卡已激活。如有系统提示，请选择设备热点。',
};
const networkStageText: Record<InitialNetworkStage, string> = {
  preflight: '正在核对原设备及已安装凭据…', handoff: '等待设备接受本次网络交接…',
  accepted: '设备已接受交接，尚未提交 Wi-Fi。', wifi: '正在连接设备热点；确认后才提交 Wi-Fi。',
  cloud: '正在只读确认原设备的云端新鲜状态…',
};

@Component({
  selector: 'app-bc5-acceptance', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  template: `
    <ion-header class="tool-page-header"><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/home/tools" text="返回" /></ion-buttons>
      <ion-title>{{ initialNetwork() ? '继续首次联网' : 'BC-5 加云验收' }}</ion-title>
    </ion-toolbar></ion-header>
    <ion-content class="ion-padding">
      <main>
        <p>{{ initialNetwork() ? '保留原设备卡与已安装凭据，本次仅继续首次联网。结果不明时请只读查询。'
          : '仅测试本次指定的 BLE 源设备。开始后最多发送一次；结果不明时请只读查询。' }}</p>
        @if (profile() || initialNetwork(); as approved) {
          @if (!initialNetwork()) { <p>源设备：{{ approved.sourceLogicalDeviceId }}</p> }
          <label for="bc5-network">目标 Wi-Fi 名称</label>
          <input #network id="bc5-network" type="text" autocapitalize="none" autocomplete="off" maxlength="32" [disabled]="busy() || attempted()" />
          <label for="bc5-password">Wi-Fi 密码（开放网络留空）</label>
          <input #password id="bc5-password" type="password" autocomplete="off" maxlength="63" [disabled]="busy() || attempted()" />
          <ion-button expand="block" [disabled]="busy() || attempted()" (click)="start(network, password)">{{ initialNetwork() ? '连接目标 Wi-Fi' : '开始一次验收' }}</ion-button>
          @if (waitingForWifiConfirmation()) {
            <ion-button expand="block" (click)="confirmWifi()">确认并发送 Wi-Fi 配置</ion-button>
          }
          <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="readOnly()">只读查询本次结果</ion-button>
          @if (busy()) { <ion-button expand="block" fill="clear" (click)="cancel()">停止本次操作</ion-button> }
        }
        <p role="status" aria-atomic="true">{{ waitingForWifiConfirmation()
          ? '热点已连接。确认后才发送 Wi-Fi 配置。' : status() }}</p>
      </main>
    </ion-content>`,
  styles: [`
    main { max-inline-size: 35rem; margin-inline: auto; overflow-wrap: anywhere; }
    label { display: block; margin-block: 1rem .5rem; }
    input { box-sizing: border-box; inline-size: 100%; min-block-size: 48px; padding: .5rem; font: inherit; color: inherit;
      background: var(--ion-background-color, Canvas); border: 1px solid currentColor; border-radius: .5rem; }
    ion-button { min-block-size: 48px; margin-block: .75rem 0; }
    [role="status"] { min-block-size: 3em; }
  `],
})
export class Bc5AcceptancePage implements OnInit, OnDestroy {
  private readonly ble = inject(DeviceV2BleService);
  private readonly management = inject(DeviceV2ManagementService);
  private operation?: AbortController;
  private destroyed = false;
  protected readonly profile = signal<Bc5AcceptanceAdmission | undefined>(undefined);
  protected readonly initialNetwork = signal<InitialNetworkAdmission | undefined>(undefined);
  private originalRecovery?: Bc5AcceptanceAdmission;
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);
  protected readonly status = signal('正在核对内测配置…');
  protected readonly waitingForWifiConfirmation = signal(false);
  private readonly wifiContinuation = new InitialCloudWifiContinuation(value => this.waitingForWifiConfirmation.set(value));

  async ngOnInit() {
    const network = await readInitialNetworkLaunchProfile().catch(() => undefined);
    if (this.destroyed) return;
    if (network) {
      const original = await readBc5RecoveryProfile().catch(() => undefined);
      if (this.destroyed) return;
      if (original) { this.initialNetwork.set(network); this.originalRecovery = original; }
      this.status.set(original ? '就绪。请先打开指定设备的首次联网窗口。' : '原安装记录入口不可用，未开始操作。');
      return;
    }
    const profile = await readBc5LaunchProfile().catch(() => undefined);
    if (this.destroyed) return;
    this.profile.set(profile);
    this.status.set(profile ? '就绪。请先打开指定板的 BC-5 窗口。' : '未配置本次内测。');
  }

  protected start(network: HTMLInputElement, password: HTMLInputElement): void {
    if (this.operation || this.attempted()) return;
    if (!network.value) { this.status.set('请输入目标 Wi-Fi 名称。'); network.focus(); return; }
    const wifi = { ssid: network.value, password: password.value }; password.value = '';
    this.attempted.set(true);
    void this.run(async (profile, signal) => {
      const admission = this.initialNetwork(), original = this.originalRecovery;
      if (admission) {
        if (!original) throw Error('INITIAL_NETWORK_LAUNCH_PROFILE_UNAVAILABLE');
        const result = await this.ble.runInstalledKeyInitialNetwork(admission, original, wifi, signal,
          (instance, expected, stop) => this.management.readProvisioningCloudV2(instance, expected, stop),
          value => this.status.set(networkStageText[value]), this.wifiContinuation);
        const local = { 'apply-queued': '设备已接收 Wi-Fi 提交', 'apply-unknown': 'Wi-Fi 回执未确认',
          'set-unconfirmed': 'Wi-Fi 参数未确认', 'apply-not-sent': '未提交 Wi-Fi', 'not-sent': '未发送 Wi-Fi' }[result.apply];
        return `${local}；${result.cloud === 'online' ? '云端新鲜状态已确认' : '云端上线未确认'}。`
          + (result.checkpoint === 'unconfirmed' ? '本机记录未确认，请只读查询，不要重复发送。' : '');
      }
      if (!profile) throw Error('BC5_LAUNCH_PROFILE_UNAVAILABLE');
      const result = await this.ble.runBc5Acceptance(profile, wifi, signal,
        (instance, expected, stop) => this.management.readProvisioningCloudV2(instance, expected, stop),
        value => this.status.set(stageText[value]), this.wifiContinuation);
      const local = { 'apply-queued': '设备已接收 Wi-Fi 提交', 'apply-unknown': 'Wi-Fi 回执未确认',
        'set-unconfirmed': 'Wi-Fi 参数未确认', 'apply-not-sent': '未提交 Wi-Fi', 'not-sent': '未发送 Wi-Fi' }[result.apply];
      return `${local}；${result.cloud === 'online' ? '云端新鲜状态已确认' : '云端上线未确认'}。`;
    });
  }

  protected confirmWifi(): void {
    if (!this.waitingForWifiConfirmation()) return;
    this.status.set('正在核对设备热点并等待 Wi-Fi 回执…');
    this.wifiContinuation.continue();
  }

  protected readOnly(): void {
    void this.run(async (profile, signal) => {
      this.status.set('正在只读查询本次结果…');
      const admission = this.initialNetwork();
      if (admission) {
        const result = await this.ble.inspectInstalledKeyInitialNetwork(admission, signal,
          (instance, expected, stop) => this.management.readProvisioningCloudV2(instance, expected, stop));
        if (!result.checkpoint) return '没有本次联网记录，未发送任何配置。';
        const text = { prepared: '尚未提交网络交接', dispatched: '网络交接回执未确认', accepted: '设备已接受交接，尚未提交 Wi-Fi',
          'wifi-dispatched': 'Wi-Fi 回执未确认', 'wifi-accepted': '已记录 Wi-Fi 提交接受',
          'wifi-rejected': '未确认 Wi-Fi 应用', 'wifi-unknown': 'Wi-Fi 结果未知' }[result.checkpoint.phase];
        return `${text}；${result.cloud === 'online' ? '云端新鲜状态已确认' : '此查询未确认云端上线'}。没有重发。`;
      }
      if (!profile) throw Error('BC5_LAUNCH_PROFILE_UNAVAILABLE');
      const result = await this.ble.recoverBc5Acceptance(profile, signal);
      return { 'no-local-checkpoint': '没有本次本地安装记录。', 'installation-unconfirmed': '安装结果仍未确认，未重发。',
        'activation-confirmed': '服务端确认云卡已激活；此查询不代表设备在线。' }[result];
    });
  }

  private async run(work: (profile: Bc5AcceptanceAdmission | undefined, signal: AbortSignal) => Promise<string>) {
    const profile = this.profile();
    if ((!profile && !this.initialNetwork()) || this.operation || this.destroyed) return;
    const owner = this.operation = new AbortController(); this.busy.set(true);
    try {
      const outcome = await work(profile, owner.signal);
      if (!owner.signal.aborted) this.status.set(outcome);
    } catch (error) {
      if (!owner.signal.aborted) {
        if (this.initialNetwork() && error instanceof InitialNetworkPreflightStop) {
          console.warn('INITIAL_NETWORK_PREFLIGHT_STOP', error.stage);
          const subject = { checkpoint: '本机记录', carrier: '配网权限', cloud: '互联网', authority: '原设备信息',
            source: '蓝牙设备与授权', prepare: '本机记录持久化' }[error.stage];
          this.status.set(`${subject}核对未完成，尚未发送本次设备配置。请只读查询；没有自动重发。`);
        } else this.status.set('本次操作未确认。请检查测试条件或只读查询；没有自动重发。');
      }
    } finally {
      if (this.operation === owner) { this.operation = undefined; this.busy.set(false); }
    }
  }

  protected cancel(): void {
    if (!this.operation) return;
    this.operation.abort(); this.status.set('已停止等待。若已发送，结果仍需只读确认。');
  }
  ionViewWillLeave(): void { this.cancel(); }
  ngOnDestroy(): void { this.destroyed = true; this.cancel(); }
}
