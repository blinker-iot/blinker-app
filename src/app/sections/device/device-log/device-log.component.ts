import { Component, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import {
  assertDeviceV2AccountContext,
  captureDeviceV2AccountContext,
  DeviceV2AccountContext,
} from '../../../core/device-v2/account-scope';
import { deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { DataService } from '../../../core/services/data.service';

type PageStatus = 'inactive' | 'ready' | 'signed-out' | 'account-changed'
  | 'unavailable' | 'preview' | 'unsupported';

const UNAVAILABLE = {
  inactive: ['请从设备设置重新进入', '此页面没有后台日志采集或缓存记录。'],
  'signed-out': ['请先登录当前账号', '登录后请从设备列表重新进入设备设置。'],
  'account-changed': ['登录账号已变化', '请返回设备列表，重新进入当前账号的设备。'],
  unavailable: ['设备不存在或当前不可用', '设备可能已移除、停用或权限已变化，请返回设备列表确认。'],
  preview: ['预览设备没有运行日志', '预览内容不代表真实设备事件，不会生成演示日志。'],
  unsupported: ['当前设备暂不支持此入口', '此入口仅适用于当前账号下的 V2 设备，不会加载旧格式日志。'],
} as const;

@Component({
  selector: 'app-device-log',
  templateUrl: './device-log.component.html',
  styleUrls: ['./device-log.component.scss'],
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
})
export class DeviceLogComponent implements OnDestroy {
  readonly status = signal<PageStatus>('inactive');
  readonly deviceName = signal('');
  private id = '';
  private visible = false;
  private destroyed = false;
  private account?: DeviceV2AccountContext;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly data: DataService,
    private readonly route: ActivatedRoute,
    private readonly navigation: NavController,
  ) {
    this.subscriptions.add(data.authDataChanged.subscribe(() => this.reconcile()));
    this.subscriptions.add(data.deviceDataLoader.subscribe(() => this.reconcile()));
  }

  get defaultBackHref(): string {
    return this.canNavigate ? `/device-manager/${encodeURIComponent(this.id)}` : '/home/device';
  }

  get unavailableTitle(): string {
    const status = this.status();
    return status === 'ready' ? '' : UNAVAILABLE[status][0];
  }

  get unavailableDescription(): string {
    const status = this.status();
    return status === 'ready' ? '' : UNAVAILABLE[status][1];
  }

  ionViewWillEnter(): void {
    if (this.destroyed) return;
    this.close();
    this.visible = true;
    this.id = this.route.snapshot.paramMap.get('id') || '';
    if (!this.data.auth?.uuid) { this.show('signed-out'); return; }
    try {
      this.account = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      this.reconcile();
    } catch { this.show('signed-out'); }
  }

  ionViewWillLeave(): void { this.close(); }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.close();
    this.subscriptions.unsubscribe();
  }

  openHistory(target: 'storage' | 'trends'): void {
    this.reconcile();
    if (!this.canNavigate) return;
    void this.navigation.navigateForward(`/device-manager/${encodeURIComponent(this.id)}/${target}`);
  }

  private get canNavigate(): boolean {
    return this.visible && !this.destroyed && this.status() === 'ready' && this.accountCurrent();
  }

  private accountCurrent(): boolean {
    if (!this.account || this.account.authority !== API.BASE_URL || !this.data.auth?.uuid) return false;
    try { assertDeviceV2AccountContext(this.data, this.account); return true; }
    catch { return false; }
  }

  private reconcile(): void {
    if (!this.visible || this.destroyed) return;
    if (!this.accountCurrent()) {
      this.account = undefined;
      this.show(this.data.auth?.uuid ? 'account-changed' : 'signed-out');
      return;
    }
    const device = this.data.getDevice(this.id);
    const state = (device as { state?: unknown } | undefined)?.state;
    if (!device || device.config.disabled || (state !== undefined && state !== 'active')) {
      this.show('unavailable'); return;
    }
    if (device.config.isPreview) { this.show('preview'); return; }
    if (device.config.mode !== 'bbp2') { this.show('unsupported'); return; }
    this.deviceName.set(deviceDisplayName(device));
    this.status.set('ready');
  }

  private show(status: Exclude<PageStatus, 'ready'>): void {
    this.deviceName.set('');
    this.status.set(status);
  }

  private close(): void {
    this.visible = false;
    this.account = undefined;
    this.id = '';
    this.show('inactive');
  }
}
