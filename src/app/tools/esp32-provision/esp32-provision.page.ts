import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import {
  BleDevice,
  PlatformCapabilities,
  ProvisionResult,
  ProvisioningDevice,
  WifiNetwork,
  WiFiProv,
  WiFiProvSecurity,
  WiFiProvTransport,
} from 'capacitor-wifiprov';

type ProvisionPhase =
  | 'idle'
  | 'permissions'
  | 'scanning'
  | 'selecting'
  | 'connecting'
  | 'ready'
  | 'provisioning'
  | 'success'
  | 'error';

interface SavedNetwork {
  ssid: string;
  password: string;
  remember: boolean;
}

@Component({
  selector: 'app-esp32-provision',
  templateUrl: './esp32-provision.page.html',
  styleUrls: ['./esp32-provision.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class Esp32ProvisionPage implements OnInit, OnDestroy {
  transport: WiFiProvTransport = 'ble';
  security: WiFiProvSecurity = 1;
  devicePrefix = 'PROV_';
  deviceName = 'PROV_';
  proofOfPossession = '';
  username = '';
  softApPassword = '';

  devices: BleDevice[] = [];
  selectedDevice?: ProvisioningDevice;
  networks: WifiNetwork[] = [];
  ssid = '';
  password = '';
  passwordVisible = false;
  rememberNetwork = false;
  scanningNetworks = false;

  phase: ProvisionPhase = 'idle';
  statusMessage = '选择配网方式并连接处于配网模式的 ESP32';
  progress = 0;
  result?: ProvisionResult;
  capabilities?: PlatformCapabilities;
  readonly nativeSupported = Capacitor.isNativePlatform();

  private listeners: PluginListenerHandle[] = [];
  private scanTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController,
    private navController: NavController
  ) {}

  goBack(): void {
    void this.navController.navigateBack('/home', { queryParams: { tab: 'tools' } });
  }

  get isScanning(): boolean {
    return this.phase === 'scanning';
  }

  get isConnecting(): boolean {
    return this.phase === 'selecting' || this.phase === 'connecting' || this.phase === 'permissions';
  }

  get isProvisioning(): boolean {
    return this.phase === 'provisioning';
  }

  get sessionReady(): boolean {
    return !!this.selectedDevice?.connected;
  }

  get canProvision(): boolean {
    return this.sessionReady && !this.isProvisioning && !!this.ssid.trim();
  }

  async ngOnInit(): Promise<void> {
    this.restoreNetwork();
    if (!this.nativeSupported) return;

    await this.bindPluginEvents();
    try {
      this.capabilities = await WiFiProv.getCapabilities();
    } catch (error) {
      this.setError(this.errorMessage(error, '无法读取配网插件能力'));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearScanTimer();
    void this.releasePlugin();
  }

  setTransport(transport: WiFiProvTransport): void {
    if (this.isScanning || this.isConnecting || this.sessionReady) return;
    this.transport = transport;
    this.devices = [];
    this.phase = 'idle';
    this.statusMessage = transport === 'ble'
      ? '扫描并选择附近处于配网模式的 ESP32'
      : '输入 ESP32 临时热点信息后建立连接';
  }

  async toggleBleScan(): Promise<void> {
    if (this.isScanning) {
      await this.stopBleScan();
    } else {
      await this.startBleScan();
    }
  }

  async startBleScan(): Promise<void> {
    if (!this.nativeSupported) {
      await this.showToast('ESP32 配网需要在 Android 或 iOS App 中使用');
      return;
    }

    try {
      await this.ensurePermissions();
      this.devices = [];
      this.phase = 'scanning';
      this.statusMessage = '正在扫描附近的 ESP32 配网设备…';
      await WiFiProv.startBleScan({
        prefix: this.devicePrefix.trim() || undefined,
        security: this.security,
      });
      this.clearScanTimer();
      this.scanTimer = setTimeout(() => void this.stopBleScan(), 12000);
    } catch (error) {
      this.setError(this.errorMessage(error, 'BLE 扫描启动失败'));
    }
  }

  async stopBleScan(): Promise<void> {
    this.clearScanTimer();
    if (!this.nativeSupported) return;
    try {
      await WiFiProv.stopBleScan();
    } catch {
      // A completed native scan can already be stopped when this call arrives.
    }
    if (this.phase === 'scanning') {
      this.phase = 'idle';
      this.statusMessage = this.devices.length
        ? `已发现 ${this.devices.length} 台设备，请选择一台连接`
        : '未发现设备，请确认 ESP32 已进入配网模式';
    }
  }

  async selectBleDevice(device: BleDevice): Promise<void> {
    if (this.isConnecting) return;
    const authError = this.validateSecurity();
    if (authError) {
      await this.showToast(authError);
      return;
    }

    await this.stopBleScan();
    this.phase = 'selecting';
    this.statusMessage = `正在选择 ${device.name}…`;
    try {
      this.selectedDevice = await WiFiProv.selectDevice({
        id: device.id,
        security: this.security,
        pop: this.proofOfPossession.trim() || undefined,
        username: this.security === 2 ? this.username.trim() : undefined,
      });
      await this.connectSession();
    } catch (error) {
      this.setError(this.errorMessage(error, '选择配网设备失败'));
    }
  }

  async connectSoftAp(): Promise<void> {
    if (!this.deviceName.trim()) {
      await this.showToast('请输入 ESP32 临时热点名称');
      return;
    }
    const authError = this.validateSecurity();
    if (authError) {
      await this.showToast(authError);
      return;
    }

    try {
      await this.ensurePermissions();
      this.phase = 'selecting';
      this.statusMessage = '正在创建 SoftAP 配网设备…';
      this.selectedDevice = await WiFiProv.createDevice({
        name: this.deviceName.trim(),
        transport: 'softap',
        security: this.security,
        pop: this.proofOfPossession.trim() || undefined,
        username: this.security === 2 ? this.username.trim() : undefined,
        softApPassword: this.softApPassword || undefined,
      });
      await this.connectSession();
    } catch (error) {
      this.setError(this.errorMessage(error, 'SoftAP 连接失败'));
    }
  }

  async scanWifiNetworks(): Promise<void> {
    if (!this.sessionReady || this.scanningNetworks) return;
    this.scanningNetworks = true;
    this.statusMessage = '正在让 ESP32 扫描附近 Wi-Fi…';
    try {
      const response = await WiFiProv.scanWifiNetworks();
      this.networks = [...response.networks].sort((a, b) => b.rssi - a.rssi);
      this.statusMessage = this.networks.length
        ? `ESP32 发现 ${this.networks.length} 个 Wi-Fi 网络`
        : 'ESP32 未返回 Wi-Fi 列表，也可以手动输入 SSID';
    } catch (error) {
      this.statusMessage = '设备不支持 Wi-Fi 扫描，请手动输入 SSID';
      await this.showToast(this.errorMessage(error, this.statusMessage));
    } finally {
      this.scanningNetworks = false;
      this.cdr.detectChanges();
    }
  }

  selectNetwork(network: WifiNetwork): void {
    this.ssid = network.ssid;
  }

  async provision(): Promise<void> {
    if (!this.canProvision) return;
    this.persistNetwork();
    this.phase = 'provisioning';
    this.progress = 10;
    this.result = undefined;
    this.statusMessage = '正在建立安全会话…';

    try {
      const result = await WiFiProv.provision({
        ssid: this.ssid.trim(),
        password: this.password || undefined,
      });
      this.result = result;
      if (result.success) {
        this.phase = 'success';
        this.progress = 100;
        this.statusMessage = 'ESP32 已成功连接 Wi-Fi';
      } else {
        this.setError('设备未能连接到目标 Wi-Fi，请检查密码后重试');
      }
    } catch (error) {
      this.setError(this.errorMessage(error, 'Wi-Fi 配置失败'));
    }
  }

  async startOver(): Promise<void> {
    this.clearScanTimer();
    if (this.nativeSupported) {
      await Promise.allSettled([WiFiProv.stopBleScan(), WiFiProv.clearState()]);
    }
    this.selectedDevice = undefined;
    this.devices = [];
    this.networks = [];
    this.result = undefined;
    this.progress = 0;
    this.phase = 'idle';
    this.statusMessage = '选择配网方式并连接处于配网模式的 ESP32';
  }

  toggleRemember(): void {
    this.rememberNetwork = !this.rememberNetwork;
    this.persistNetwork();
  }

  signalBars(rssi?: number): string {
    if (rssi === undefined) return 'fa-light fa-signal-bars-weak';
    if (rssi >= -55) return 'fa-light fa-signal-bars';
    if (rssi >= -72) return 'fa-light fa-signal-bars-fair';
    return 'fa-light fa-signal-bars-weak';
  }

  wifiSecurityLabel(security: number | string): string {
    const value = String(security).toLowerCase();
    return value === '0' || value.includes('open') ? '开放' : '加密';
  }

  private async connectSession(): Promise<void> {
    this.phase = 'connecting';
    this.statusMessage = '正在建立安全配网会话…';
    this.selectedDevice = await WiFiProv.connect({
      pop: this.proofOfPossession.trim() || undefined,
      username: this.security === 2 ? this.username.trim() : undefined,
      softApPassword: this.transport === 'softap' ? this.softApPassword || undefined : undefined,
    });
    this.phase = 'ready';
    this.statusMessage = '设备已连接，可以选择目标 Wi-Fi';
    await this.scanWifiNetworks();
  }

  private async ensurePermissions(): Promise<void> {
    this.phase = 'permissions';
    this.statusMessage = '正在申请蓝牙与附近设备权限…';
    const permissions = await WiFiProv.requestPermissions();
    const denied = Object.values(permissions).some(state => state === 'denied');
    if (denied) throw new Error('配网权限被拒绝，请在系统设置中允许蓝牙与附近设备权限');
  }

  private validateSecurity(): string | null {
    if (this.security === 2 && !this.username.trim()) return 'Security 2 需要填写用户名';
    if ((this.security === 1 || this.security === 2) && !this.proofOfPossession.trim()) {
      return '当前安全模式需要填写设备 PoP';
    }
    return null;
  }

  private async bindPluginEvents(): Promise<void> {
    try {
      this.listeners.push(await WiFiProv.addListener('bleScanResult', device => {
        this.zone.run(() => this.upsertDevice(device));
      }));
      this.listeners.push(await WiFiProv.addListener('bleScanState', event => {
        this.zone.run(() => {
          if (event.state !== 'started' && this.phase === 'scanning') {
            this.phase = 'idle';
            this.statusMessage = this.devices.length
              ? `已发现 ${this.devices.length} 台设备，请选择一台连接`
              : event.message || '扫描已结束，未发现设备';
          }
        });
      }));
      this.listeners.push(await WiFiProv.addListener('connectionState', event => {
        this.zone.run(() => {
          if (event.device) this.selectedDevice = event.device;
          if (event.state === 'failed') this.setError(event.message || '配网会话连接失败');
          if (event.state === 'disconnected' && this.phase !== 'success' && this.phase !== 'error') {
            this.selectedDevice = undefined;
            this.phase = 'idle';
            this.statusMessage = '设备连接已断开';
          }
        });
      }));
      this.listeners.push(await WiFiProv.addListener('provisioningProgress', event => {
        this.zone.run(() => {
          const states: Record<typeof event.step, { progress: number; message: string }> = {
            session: { progress: 18, message: '安全会话已建立' },
            'config-sent': { progress: 42, message: 'Wi-Fi 凭据已发送' },
            'config-applied': { progress: 68, message: '设备正在应用网络配置' },
            'checking-connection': { progress: 86, message: '正在检查 ESP32 联网状态' },
            success: { progress: 100, message: 'ESP32 已成功连接 Wi-Fi' },
            failed: { progress: 100, message: 'ESP32 连接 Wi-Fi 失败' },
          };
          this.progress = states[event.step].progress;
          this.statusMessage = event.message || states[event.step].message;
        });
      }));
      this.listeners.push(await WiFiProv.addListener('error', event => {
        this.zone.run(() => this.setError(event.message || `${event.operation} 操作失败`));
      }));
    } catch (error) {
      this.setError(this.errorMessage(error, '无法初始化 Wi-Fi Provisioning 插件'));
    }
  }

  private upsertDevice(device: BleDevice): void {
    const index = this.devices.findIndex(item => item.id === device.id);
    const next = [...this.devices];
    if (index >= 0) next[index] = { ...next[index], ...device };
    else next.push(device);
    this.devices = next.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
  }

  private setError(message: string): void {
    this.phase = 'error';
    this.statusMessage = message;
    if (!this.destroyed) this.cdr.detectChanges();
  }

  private persistNetwork(): void {
    if (!this.rememberNetwork) {
      localStorage.removeItem('wifiProvNetwork');
      return;
    }
    const data: SavedNetwork = {
      ssid: this.ssid,
      password: this.password,
      remember: true,
    };
    localStorage.setItem('wifiProvNetwork', JSON.stringify(data));
  }

  private restoreNetwork(): void {
    try {
      const raw = localStorage.getItem('wifiProvNetwork');
      if (!raw) return;
      const data = JSON.parse(raw) as SavedNetwork;
      if (!data.remember) return;
      this.ssid = data.ssid || '';
      this.password = data.password || '';
      this.rememberNetwork = true;
    } catch {
      localStorage.removeItem('wifiProvNetwork');
    }
  }

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
  }

  private async releasePlugin(): Promise<void> {
    if (!this.nativeSupported) return;
    await Promise.allSettled([WiFiProv.stopBleScan(), WiFiProv.clearState()]);
    await Promise.allSettled(this.listeners.map(listener => listener.remove()));
    this.listeners = [];
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error) return error;
    return fallback;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2400, position: 'bottom' });
    await toast.present();
  }
}
