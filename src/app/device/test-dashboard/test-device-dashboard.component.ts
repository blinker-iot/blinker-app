import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular';
import { BDeviceImgComponent } from '../../core/components/b-device-img/b-device-img.component';
import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceService } from '../../core/services/device.service';
import { Subscription } from 'rxjs';
import { DeviceUiConnection, DeviceUiConnectionState, DeviceUiEndpoint, DeviceUiPort, DeviceUiSnapshot, DeviceUiTransport, DeviceUiValue } from '../../core/device-v2/device-ui.port';

interface DeviceInterfaceAction {
  id: 'ai' | 'layouter';
  title: string;
  description: string;
  icon: string;
}

interface DeviceMetric {
  key: string;
  label: string;
  value: string | number;
  unit: string;
}

const METRIC_METADATA: Record<string, { label: string; unit: string }> = {
  temperature: { label: '温度', unit: '°C' },
  temp: { label: '温度', unit: '°C' },
  humidity: { label: '湿度', unit: '%' },
  humi: { label: '湿度', unit: '%' },
  soilMoisture: { label: '土壤湿度', unit: '%' },
  moisture: { label: '湿度', unit: '%' },
  pm25: { label: 'PM2.5', unit: '' },
  co2: { label: 'CO₂', unit: 'ppm' },
  voltage: { label: '电压', unit: 'V' },
  current: { label: '电流', unit: 'A' },
  power: { label: '功率', unit: 'W' },
  energy: { label: '用电量', unit: 'kWh' },
  frequency: { label: '频率', unit: 'Hz' },
  powerFactor: { label: '功率因数', unit: '' },
  position: { label: '位置', unit: '%' },
  brightness: { label: '亮度', unit: '%' },
};

@Component({
  selector: 'app-test-device-dashboard',
  standalone: true,
  imports: [CommonModule, BDeviceImgComponent],
  templateUrl: './test-device-dashboard.component.html',
  styleUrls: ['./test-device-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})

export class TestDeviceDashboardComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) device!: BlinkerDevice;

  readonly interfaceActions: readonly DeviceInterfaceAction[] = [
    {
      id: 'ai',
      title: 'AI 生成',
      description: '用 AI 生成和调整面板',
      icon: 'fa-wand-magic-sparkles',
    },
    {
      id: 'layouter',
      title: '手动编辑',
      description: '添加部件，调整布局与属性',
      icon: 'fa-grid-4',
    },
  ];

  refreshedAt = new Date();
  error = '';
  snapshot?: DeviceUiSnapshot;

  pending = new Set<string>();
  private initialized = false;
  private visible = true;
  private appActive = false;
  private accountState: DeviceUiConnectionState = 'idle';
  private transport: DeviceUiTransport = 'cloud';
  private connection?: DeviceUiConnection;
  private connecting?: DeviceUiConnection;
  private subscriptions = new Subscription();
  private deviceSubscriptions = new Subscription();
  private legacySwitchTimer?: ReturnType<typeof setTimeout>;

  @Input() get viewActive(): boolean { return this.visible; }

  set viewActive(value: boolean) {
    this.visible = value;

    if (this.initialized) this.updateConnection();
  }

  constructor(public readonly deviceService: DeviceService, private readonly nav: NavController,
    private readonly deviceUi: DeviceUiPort, private readonly cd: ChangeDetectorRef) {}

  get isPreview(): boolean { return !!this.device?.config?.isPreview; }
  get usesV2Data(): boolean { return this.device?.config.mode === 'bbp2' && !this.isPreview; }

  ngOnInit(): void {
    this.initialized = true;

    this.bindDevice();

    this.subscriptions.add(this.deviceUi.appActive.subscribe(active => {
      this.appActive = active;

      this.updateConnection();
    }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.initialized && changes['device']) this.bindDevice();
  }

  ngOnDestroy(): void {
    this.initialized = false;

    this.closeConnection();
    this.subscriptions.unsubscribe();
    this.deviceSubscriptions.unsubscribe();
    clearTimeout(this.legacySwitchTimer);
  }

  get isOnline(): boolean {
    if (this.usesV2Data) {
      return this.accountState === 'ready' && !!this.snapshot?.stateFresh;
    }

    if (this.device?.config.mode === 'ble') return this.device.data?.state === 'connected';

    return !!this.device?.data?.enable;
  }

  get canControl(): boolean {
    if (!this.usesV2Data) return this.isOnline;

    return this.visible && this.appActive && this.accountState === 'ready'
      && !!this.snapshot?.manifestAccepted && this.snapshot.stateFresh
      && this.connection?.signal.aborted === false;
  }

  get stateLabel(): string {
    if (!this.usesV2Data) return this.isOnline ? '在线' : '离线';

    if (this.isOnline) {
      if (!this.canControl) return '在线 · 同步中';

      return this.transport === 'ble' ? '蓝牙已连接' : this.transport === 'lan' ? '局域网已连接' : '在线';
    }

    if (this.connecting || this.accountState === 'connecting') return '正在连接';
    if (this.accountState === 'retrying') return '正在重连';
    if (this.transport === 'cloud' && this.device.data?.cloudReachable !== false) return '状态待同步';

    return '离线';
  }

  get statusText(): string {
    return this.isPreview ? this.isOnline ? '测试数据 · 在线' : '测试数据 · 离线' : this.stateLabel;
  }

  private isSwitchField(field: DeviceUiEndpoint): boolean {
    return field.role === 'property' && field.writable && field.valueType === 'boolean';
  }

  get switchField(): DeviceUiEndpoint | undefined {
    const candidates = this.snapshot?.endpoints.filter(field => this.isSwitchField(field)) ?? [];
    const configured = candidates.filter(field => this.device.config.card?.actions?.some(action => action.key === field.key));

    return configured.length === 1 ? configured[0] : candidates.length === 1 ? candidates[0] : undefined;
  }

  get hasSwitch(): boolean {
    return this.usesV2Data ? !!this.switchField : this.device?.data?.switch !== undefined;
  }

  get switchKnown(): boolean {
    return this.usesV2Data ? typeof this.switchField?.value === 'boolean'
      : [true, false, 'on', 'off'].includes(this.device?.data?.switch);
  }

  get switchOn(): boolean {
    return this.usesV2Data ? this.switchField?.value === true : this.device?.data?.switch === 'on' || this.device?.data?.switch === true;
  }

  get switchWaiting(): boolean {
    return this.usesV2Data ? this.pending.has(this.switchField?.key || '') : this.device?.data?.switch === 'waiting';
  }

  get metrics(): DeviceMetric[] {
    if (!this.device) return [];

    if (this.usesV2Data) return (this.snapshot?.endpoints ?? []).map(field => ({
      key: field.key,
      label: this.device.config.card?.metrics?.find(metric => metric.key === field.key)?.label || field.key,
      value: this.formatValue(field.value), unit: field.unit || '',
    }));

    const configured = this.device.config.card?.metrics || [];
    const configuredByKey = new Map(configured.map((item) => [item.key, item]));

    const orderedKeys = [
      ...configured.map((item) => item.key),
      ...Object.keys(this.device.data || {}).filter(
        (key) => !configuredByKey.has(key),
      ),
    ];

    const ignoredKeys = new Set([
      'enable',
      'state',
      'oldState',
      'switch',
      'hasNewVersion',
      'layouterData',
      'history',
    ]);

    return orderedKeys
      .filter((key, index) => orderedKeys.indexOf(key) === index)
      .filter((key) => !ignoredKeys.has(key))
      .map((key) => {
        const value = this.device.data?.[key];

        if (
          (typeof value !== 'number' || !Number.isFinite(value)) &&
          typeof value !== 'string'
        ) {
          return null;
        }

        const config = configuredByKey.get(key);
        const metadata = METRIC_METADATA[key];

        return {
          key,
          label: config?.label || metadata?.label || key,
          value:
            typeof value === 'number' && !Number.isInteger(value)
              ? Number(value.toFixed(1))
              : value,
          unit: config?.unit ?? metadata?.unit ?? '',
        };
      })
      .filter((metric): metric is DeviceMetric => metric !== null);
  }

  refresh(): void {
    this.refreshedAt = new Date();

    if (this.usesV2Data) void this.synchronize();
    else if (!this.isPreview) this.deviceService.queryDevice(this.device);
  }

  async selectInterface(action: DeviceInterfaceAction): Promise<void> {
    if (this.device.config.isShared) return;

    const id = encodeURIComponent(this.device.id || this.device.deviceName);

    await this.nav.navigateForward(action.id === 'ai' ? `/device-manager/${id}/uic` : `/device/${id}/edit`);
  }

  toggleSwitch(): void {
    if (!this.hasSwitch || !this.canControl || !this.switchKnown || this.switchWaiting) return;

    if (this.usesV2Data && this.switchField) {
      void this.toggleField(this.switchField);

      return;
    }

    const nextState = this.switchOn ? 'off' : 'on';

    if (this.isPreview) {
      this.device.data.switch = nextState;

      this.device.subject.next({ key: 'switch', value: nextState });

      this.refreshedAt = new Date();

      return;
    }

    const previousState = this.device.data.switch;

    this.device.data.switch = 'waiting';

    this.deviceService.sendData(
      this.device,
      JSON.stringify({ switch: nextState }),
    );

    this.legacySwitchTimer = setTimeout(() => {
      if (this.device.data?.switch === 'waiting') {
        this.device.data.switch = previousState;
      }
    }, 3000);
  }

  async toggleField(field: DeviceUiEndpoint): Promise<void> {
    if (!this.canControl || !this.isSwitchField(field) || typeof field.value !== 'boolean' || this.pending.has(field.key)) return;

    this.pending.add(field.key);

    this.error = '';

    try { await this.deviceUi.sendCommand(this.device.deviceName, field.key, !field.value); }

    catch { this.error = '开关操作失败，请确认设备连接后重试。'; }
    finally { this.pending.delete(field.key); this.cd.markForCheck(); }
  }

  private bindDevice(): void {
    this.closeConnection();
    this.deviceSubscriptions.unsubscribe();

    this.deviceSubscriptions = new Subscription();
    this.snapshot = undefined;
    this.accountState = 'idle';

    this.pending.clear();

    this.error = '';

    this.deviceSubscriptions.add(this.device.subject.subscribe(() => this.cd.markForCheck()));

    if (!this.usesV2Data) return;

    const id = this.device.deviceName;

    this.deviceSubscriptions.add(this.deviceUi.watchState(id).subscribe({
      next: snapshot => {
        this.snapshot = snapshot;
        this.refreshedAt = new Date();

        this.cd.markForCheck();
      },
      error: () => { this.error = '设备状态读取失败，请重试。'; this.cd.markForCheck(); },
    }));

    this.deviceSubscriptions.add(this.deviceUi.watchConnectivity(id).subscribe(connectivity => {
      this.transport = connectivity.activeTransport;

      this.cd.markForCheck();
    }));

    this.deviceSubscriptions.add(this.deviceUi.watchConnection(id).subscribe(state => {
      this.accountState = state;

      if (state === 'ready' && !this.connection) this.updateConnection();

      this.cd.markForCheck();
    }));

    this.updateConnection();
  }

  private updateConnection(): void {
    if (!this.visible || !this.appActive) this.closeConnection();
    else if (this.usesV2Data && !this.connection && !this.connecting) void this.synchronize();
  }

  private async synchronize(): Promise<void> {
    if (!this.initialized || !this.visible || !this.appActive || this.connecting || !this.usesV2Data) return;

    const device = this.device;
    const next = this.deviceUi.openConnection(device.deviceName);

    this.connecting = next;
    this.error = '';

    void next.closed.then(() => {
      if (this.connection !== next) return;

      this.connection = undefined;

      this.cd.markForCheck();
    });

    try {
      await next.ready;

      if (this.connecting !== next || next.signal.aborted || !this.visible || !this.appActive || this.device !== device) return;

      const previous = this.connection;

      this.connection = next;

      previous?.close();
    } catch {
      if (this.connecting === next && this.visible && this.appActive && !this.connection) {
        this.error = '设备同步失败，请检查连接后刷新。';
      }
    } finally {
      if (this.connecting === next) this.connecting = undefined;

      this.cd.markForCheck();
    }
  }

  private closeConnection(): void {
    const pending = this.connecting;
    const current = this.connection;

    this.connecting = undefined;
    this.connection = undefined;

    pending?.close();
    current?.close();
  }

  private formatValue(value: DeviceUiValue | undefined): string {
    if (value === undefined || value === null) return '—';
    if (value instanceof Uint8Array) return [...value].map(byte => byte.toString(16).padStart(2, '0')).join(' ');

    return String(value);
  }
}
