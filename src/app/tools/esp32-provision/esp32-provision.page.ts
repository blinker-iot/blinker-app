import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { AlertController, IonicModule, NavController, ToastController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import {
  CapacitorBleControllerCredentialStore,
  clearBleControllerCredentialSecrets,
} from 'src/app/core/device-v2/ble-direct';
import { CapacitorEsp32ProvisioningTransport } from 'src/app/core/device-v2/provisioning/capacitor-esp32-wifiprov.transport';
import {
  decodeBlinkerConfigInfo,
  encodeBlinkerConfigInfoRequest,
  configureBlinkerAccess,
  BLINKER_CONFIG_ENDPOINT,
  BlinkerConfigOperation,
  BlinkerConfigInfo,
} from 'src/app/core/device-v2/provisioning/esp32-wifiprov';
import { DeviceUiPort } from 'src/app/core/device-v2/device-ui.port';
import { DeviceV2ManagementService } from 'src/app/core/services/device-v2-management.service';
import { DataService } from 'src/app/core/services/data.service';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceKeyContext } from 'src/app/core/model/response.model';
import {
  BleDevice,
  PlatformCapabilities,
  ProvisionResult,
  ProvisioningDevice,
  WifiNetwork,
  WiFiProv,
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

interface AllocationBase {
  logicalDeviceId: string;
  deviceKey: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
}

type PreservedAccessAllocation = AllocationBase & {
  preserveAccess: true;
  credentialStored: true;
};

type CloudOnlyAllocation = AllocationBase & {
  preserveAccess: false;
  credentialStored: true;
};

type BootstrapAllocation = AllocationBase & {
  preserveAccess: false;
  controllerId: Uint8Array;
  controllerSecret: Uint8Array;
  credentialStored: boolean;
};

type DeviceAllocation =
  | PreservedAccessAllocation
  | CloudOnlyAllocation
  | BootstrapAllocation;

@Component({
  selector: 'app-esp32-provision',
  templateUrl: './esp32-provision.page.html',
  styleUrls: ['./esp32-provision.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonicModule, HeroCardComponent],
})
export class Esp32ProvisionPage implements OnInit, OnDestroy {
  transport: WiFiProvTransport = 'ble';
  readonly security = 1;
  devicePrefix = 'BLINKER_';
  deviceName = 'BLINKER_';
  softApPassword = '';

  devices: BleDevice[] = [];
  selectedDevice?: ProvisioningDevice;
  networks: WifiNetwork[] = [];
  ssid = '';
  password = '';
  passwordVisible = false;
  rememberNetwork = false;
  scanningNetworks = false;
  blinkerDeviceName = 'ESP32 WiFiBLE';

  phase: ProvisionPhase = 'idle';
  statusMessage = '选择配网方式并连接处于配网模式的 ESP32';
  progress = 0;
  result?: ProvisionResult;
  capabilities?: PlatformCapabilities;
  readonly nativeSupported = Capacitor.isNativePlatform();

  private listeners: PluginListenerHandle[] = [];
  private scanTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private allocation?: DeviceAllocation;
  private allocationIdempotencyKey = '';
  private reconfigureContext?: DeviceKeyContext;
  private pluginRelease?: Promise<void>;
  private readonly provisioningTransport = new CapacitorEsp32ProvisioningTransport();
  private readonly controllerCredentials = new CapacitorBleControllerCredentialStore();

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController,
    private deviceManagement: DeviceV2ManagementService,
    private userService: UserService,
    private dataService: DataService,
    private deviceUi: DeviceUiPort,
    private route: ActivatedRoute,
    private navController: NavController,
    private alertController: AlertController,
  ) {}

  get reconfiguring(): boolean {
    return !!this.reconfigureContext;
  }

  get isScanning(): boolean {
    return this.phase === 'scanning';
  }

  get isConnecting(): boolean {
    return (
      this.phase === 'selecting' ||
      this.phase === 'connecting' ||
      this.phase === 'permissions'
    );
  }

  get isProvisioning(): boolean {
    return this.phase === 'provisioning';
  }

  get sessionReady(): boolean {
    return !!this.selectedDevice?.connected;
  }

  get canProvision(): boolean {
    return this.sessionReady
      && !this.isProvisioning
      && !!this.ssid.trim()
      && !!this.blinkerDeviceName.trim();
  }

  async ngOnInit(): Promise<void> {
    this.restoreNetwork();
    if (!this.loadReconfigureContext()) return;
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
    this.clearAllocation();
  }

  setTransport(transport: WiFiProvTransport): void {
    if (this.isScanning || this.isConnecting || this.sessionReady) return;
    this.transport = transport;
    this.devices = [];
    this.phase = 'idle';
    this.statusMessage =
      transport === 'ble'
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

    await this.stopBleScan();
    this.phase = 'selecting';
    this.statusMessage = `正在选择 ${device.name}…`;
    try {
      this.selectedDevice = await WiFiProv.selectDevice({
        id: device.id,
        security: this.security,
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
    try {
      await this.ensurePermissions();
      this.phase = 'selecting';
      this.statusMessage = '正在创建 SoftAP 配网设备…';
      this.selectedDevice = await WiFiProv.createDevice({
        name: this.deviceName.trim(),
        transport: 'softap',
        security: this.security,
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
      await this.installBlinkerIdentity();
      this.progress = 28;
      this.statusMessage = '设备身份已写入，正在发送 Wi-Fi 凭据…';
      const result = await WiFiProv.provision({
        ssid: this.ssid.trim(),
        password: this.password || undefined,
      });
      this.result = result;
      if (result.success) {
        this.phase = 'success';
        this.progress = 100;
        this.statusMessage = '设备身份与 Wi-Fi 已写入，正在等待云端上线';
        await this.openProvisionedDevice();
      } else {
        this.setError('设备未能连接到目标 Wi-Fi，请检查密码后重试');
      }
    } catch (error) {
      this.setError(this.errorMessage(error, 'Wi-Fi 配置失败'));
    }
  }

  async startOver(): Promise<void> {
    const completed = this.phase === 'success';
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
    if (completed) this.clearAllocation();
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
      softApPassword:
        this.transport === 'softap'
          ? this.softApPassword || undefined
          : undefined,
    });
    this.phase = 'ready';
    this.statusMessage = '设备已连接，可以选择目标 Wi-Fi';
    await this.scanWifiNetworks();
  }

  private async installBlinkerIdentity(): Promise<void> {
    const info = decodeBlinkerConfigInfo(await this.provisioningTransport.request(
      BLINKER_CONFIG_ENDPOINT,
      encodeBlinkerConfigInfoRequest(),
    ));
    let allocation = this.allocation;
    if (allocation && !sameBytes(allocation.deviceInstanceId, info.deviceInstanceId)) {
      throw new Error('当前配网事务属于另一台设备，请重新开始');
    }
    if (!allocation && this.reconfiguring && info.hasDeviceKey) {
      this.allocation = await this.resumeExistingIdentity(info);
      return;
    }
    if (!allocation) {
      if (info.hasAccessState) {
        if (this.reconfiguring) {
          throw new Error(
            '设备接入权限仍存在但 DeviceKey 已清除；请完成接入重置后重试',
          );
        }
        allocation = await this.enableCloudForExistingBleDevice(info);
        this.allocation = allocation;
      } else if (info.hasDeviceKey) {
        throw new Error(this.reconfiguring
          ? '设备身份状态与重新配网上下文不一致，请返回设备页面重试'
          : '设备已有身份，请从原设备页面发起重新配网');
      } else {
        if (!this.reconfigureContext) {
          const resolved = (await this.deviceManagement.resolveDeviceInstanceV2(
            info.deviceInstanceId,
          )).data.device;
          if (resolved) {
            const confirmed = await this.confirmExistingDevice(resolved.name, false);
            if (!confirmed) throw new Error('已取消覆盖原设备的重新配网');
            if (!resolved.credentialVersion || !resolved.locator) {
              throw new Error('原设备尚无云凭据，请先通过原设备的 BLE 接入记录恢复');
            }
            this.reconfigureContext = {
              logicalDeviceId: resolved.logicalDeviceId,
              credentialVersion: resolved.credentialVersion,
              locator: resolved.locator,
            };
            this.blinkerDeviceName = resolved.name;
          }
        }
        const identity = this.reconfigureContext
          ? (await this.deviceManagement.rotateDeviceKeyV2(
              this.reconfigureContext,
              this.allocationRequestId(),
            )).data
          : await this.createDeviceIdentity();
        if (this.reconfigureContext) {
          this.reconfigureContext = {
            logicalDeviceId: identity.logicalDeviceId,
            credentialVersion: identity.credentialVersion,
            locator: identity.locator,
          };
        }
        const base = {
          logicalDeviceId: identity.logicalDeviceId,
          deviceKey: identity.deviceKey,
          deviceInstanceId: info.deviceInstanceId.slice(),
          accessEpoch: 1,
          preserveAccess: false as const,
        };
        allocation = info.supportsAccessBootstrap
          ? {
              ...base,
              controllerId: randomBytes(16),
              controllerSecret: randomBytes(32),
              credentialStored: false,
            }
          : {
              ...base,
              credentialStored: true,
            };
        this.allocation = allocation;
      }
    }

    const bootstrap = isBootstrapAllocation(allocation) ? {
      accessEpoch: allocation.accessEpoch,
      controllerId: allocation.controllerId,
      credentialVersion: 1,
      controllerSecret: allocation.controllerSecret,
    } : undefined;
    const configured = await configureBlinkerAccess(
      this.provisioningTransport,
      allocation.deviceKey,
      bootstrap,
      info,
    );
    if (!isBootstrapAllocation(allocation)) {
      // Device GetInfo is the capability authority. A Cloud-only product must
      // not inherit a local Direct credential merely because this logical id
      // was previously used by different firmware.
      if (!allocation.preserveAccess
        && configured.operation === BlinkerConfigOperation.Install) {
        await this.controllerCredentials
          .remove(allocation.logicalDeviceId)
          .catch(() => undefined);
      }
      return;
    }
    if (allocation.credentialStored) return;
    await this.controllerCredentials.save({
      source: 'wifiprov',
      state: 'active',
      logicalDeviceId: allocation.logicalDeviceId,
      deviceInstanceId: allocation.deviceInstanceId,
      accessEpoch: allocation.accessEpoch,
      controllerId: allocation.controllerId,
      controllerSecret: allocation.controllerSecret,
      credentialVersion: 1,
      permissions: 0x0f,
      intentId: new Uint8Array(),
      commitId: new Uint8Array(),
      receipt: new Uint8Array(),
    });
    allocation.credentialStored = true;
    allocation.controllerSecret.fill(0);
  }

  private async resumeExistingIdentity(
    info: BlinkerConfigInfo,
  ): Promise<DeviceAllocation> {
    const expected = this.reconfigureContext!;
    const resolved = (await this.deviceManagement.resolveDeviceInstanceV2(
      info.deviceInstanceId,
    )).data.device;
    if (!resolved
      || resolved.logicalDeviceId !== expected.logicalDeviceId
      || resolved.credentialVersion !== expected.credentialVersion
      || resolved.locator !== expected.locator) {
      throw new Error('扫描到的设备不是当前重新配网的原设备');
    }

    if (info.hasAccessState) {
      const credential = await this.controllerCredentials.load(expected.logicalDeviceId);
      if (!credential) {
        throw new Error('本机缺少该设备的 BLE 控制凭据；请先恢复控制权或执行接入重置');
      }
      try {
        if (credential.state !== 'active'
          || !sameBytes(credential.deviceInstanceId, info.deviceInstanceId)
          || credential.accessEpoch !== info.accessEpoch) {
          throw new Error('本机 BLE 控制凭据与设备身份不一致；请先恢复控制权或执行接入重置');
        }
      } finally {
        clearBleControllerCredentialSecrets(credential);
      }
    }

    this.blinkerDeviceName = resolved.name;
    const allocation = {
      logicalDeviceId: resolved.logicalDeviceId,
      deviceKey: '',
      deviceInstanceId: info.deviceInstanceId.slice(),
      accessEpoch: info.accessEpoch,
      credentialStored: true as const,
    };
    return info.hasAccessState
      ? { ...allocation, preserveAccess: true }
      : { ...allocation, preserveAccess: false };
  }

  private async enableCloudForExistingBleDevice(
    info: BlinkerConfigInfo,
  ): Promise<DeviceAllocation> {
    const resolved = (await this.deviceManagement.resolveDeviceInstanceV2(
      info.deviceInstanceId,
    )).data.device;
    if (!resolved) {
      throw new Error('设备已有 BLE 身份，但当前账号没有对应接入记录；请恢复原账号或重置设备');
    }
    const credential = await this.controllerCredentials.load(resolved.logicalDeviceId);
    if (!credential) {
      throw new Error('本机缺少该设备的 BLE 控制凭据；请先恢复控制权或重置设备');
    }
    try {
      if (credential.state !== 'active'
        || !sameBytes(credential.deviceInstanceId, info.deviceInstanceId)
        || credential.accessEpoch !== info.accessEpoch) {
        throw new Error('本机 BLE 控制凭据与设备身份不一致；请先恢复控制权或重置设备');
      }
    } finally {
      clearBleControllerCredentialSecrets(credential);
    }
    if (!await this.confirmExistingDevice(resolved.name, true)) {
      throw new Error('已取消为原 BLE 设备启用 Wi-Fi');
    }
    this.blinkerDeviceName = resolved.name;
    const identity = (await this.deviceManagement.enableDeviceCloudV2(
      info.deviceInstanceId,
    )).data;
    return {
      logicalDeviceId: identity.logicalDeviceId,
      deviceKey: identity.deviceKey,
      deviceInstanceId: info.deviceInstanceId.slice(),
      accessEpoch: info.accessEpoch,
      preserveAccess: true,
      credentialStored: true,
    };
  }

  private async createDeviceIdentity(): Promise<DeviceKeyContext & { deviceKey: string }> {
    const created = await this.deviceManagement.createDeviceKeyV2(
      this.blinkerDeviceName.trim(),
      this.allocationRequestId(),
      'diy',
    );
    const context = created.data.device;
    const revealed = await this.deviceManagement.revealDeviceKeyV2({
      logicalDeviceId: context.logicalDeviceId,
      credentialVersion: context.credentialVersion,
      locator: context.locator,
    });
    return revealed.data;
  }

  private allocationRequestId(): string {
    this.allocationIdempotencyKey ||= `wifiprov-${hex(randomBytes(16))}`;
    return this.allocationIdempotencyKey;
  }

  private async confirmExistingDevice(name: string, preserveAccess: boolean): Promise<boolean> {
    const alert = await this.alertController.create({
      header: '发现已添加的设备',
      message: preserveAccess
        ? `“${name}”已属于当前账号。继续会保留原控制页面和 BLE 控制权，并为它启用 Wi-Fi。`
        : `“${name}”已属于当前账号。继续会保留原控制页面并更新网络与接入凭据。`,
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '继续重新配置', role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }

  private clearAllocation(): void {
    if (!this.allocation) return;
    this.allocation.deviceKey = '';
    if (isBootstrapAllocation(this.allocation)) this.allocation.controllerSecret.fill(0);
    this.allocation = undefined;
    this.allocationIdempotencyKey = '';
  }

  private loadReconfigureContext(): boolean {
    if (this.route.snapshot.queryParamMap.get('mode') !== 'reconfigure') return true;
    const logicalDeviceId = this.route.snapshot.queryParamMap.get('logicalDeviceId') ?? '';
    const device = this.dataService.getDevice(logicalDeviceId) as
      | (Partial<DeviceKeyContext> & { config?: { customName?: string; isShared?: boolean } })
      | undefined;
    if (!device || device.config?.isShared || device.logicalDeviceId !== logicalDeviceId
      || !Number.isSafeInteger(device.credentialVersion) || (device.credentialVersion ?? 0) < 1
      || typeof device.locator !== 'string' || !device.locator) {
      this.setError('无法读取原设备的重新配网上下文，请返回设备页面重试');
      return false;
    }
    this.reconfigureContext = {
      logicalDeviceId,
      credentialVersion: device.credentialVersion!,
      locator: device.locator,
    };
    this.blinkerDeviceName = device.config?.customName?.trim() || this.blinkerDeviceName;
    this.statusMessage = '请确认设备已重置接入信息，再扫描 BLINKER_ 配网设备';
    return true;
  }

  async openProvisionedDevice(): Promise<void> {
    const logicalDeviceId = this.allocation?.logicalDeviceId;
    if (!logicalDeviceId) return;
    await this.releasePlugin();
    if (this.destroyed) return;
    const loaded = await this.userService.getAllInfo().catch(() => false);
    if (this.destroyed) return;
    if (!loaded && !this.dataService.getDevice(logicalDeviceId)) {
      this.statusMessage = '设备已写入 Wi-Fi；设备列表刷新失败，请稍后从设备列表进入';
      return;
    }
    void this.deviceUi.startDirectHandoff(logicalDeviceId);
    await this.navController.navigateRoot(`/device/${encodeURIComponent(logicalDeviceId)}`);
  }

  private async ensurePermissions(): Promise<void> {
    this.phase = 'permissions';
    this.statusMessage = '正在申请蓝牙与附近设备权限…';
    const permissions = await WiFiProv.requestPermissions();
    const denied = Object.values(permissions).some(
      (state) => state === 'denied'
    );
    if (denied)
      throw new Error('配网权限被拒绝，请在系统设置中允许蓝牙与附近设备权限');
  }

  private async bindPluginEvents(): Promise<void> {
    try {
      this.listeners.push(
        await WiFiProv.addListener('bleScanResult', (device) => {
          this.zone.run(() => this.upsertDevice(device));
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('bleScanState', (event) => {
          this.zone.run(() => {
            if (event.state !== 'started' && this.phase === 'scanning') {
              this.phase = 'idle';
              this.statusMessage = this.devices.length
                ? `已发现 ${this.devices.length} 台设备，请选择一台连接`
                : event.message || '扫描已结束，未发现设备';
            }
          });
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('connectionState', (event) => {
          this.zone.run(() => {
            if (event.device) this.selectedDevice = event.device;
            if (event.state === 'failed')
              this.setError(event.message || '配网会话连接失败');
            if (
              event.state === 'disconnected' &&
              this.phase !== 'success' &&
              this.phase !== 'error'
            ) {
              this.selectedDevice = undefined;
              this.phase = 'idle';
              this.statusMessage = '设备连接已断开';
            }
          });
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('provisioningProgress', (event) => {
          this.zone.run(() => {
            const states: Record<
              typeof event.step,
              { progress: number; message: string }
            > = {
              session: { progress: 18, message: '安全会话已建立' },
              'config-sent': { progress: 42, message: 'Wi-Fi 凭据已发送' },
              'config-applied': {
                progress: 68,
                message: '设备正在应用网络配置',
              },
              'checking-connection': {
                progress: 86,
                message: '正在检查 ESP32 联网状态',
              },
              success: { progress: 100, message: 'ESP32 已成功连接 Wi-Fi' },
              failed: { progress: 100, message: 'ESP32 连接 Wi-Fi 失败' },
            };
            this.progress = states[event.step].progress;
            this.statusMessage = event.message || states[event.step].message;
          });
        })
      );
      this.listeners.push(
        await WiFiProv.addListener('error', (event) => {
          this.zone.run(() =>
            this.setError(event.message || `${event.operation} 操作失败`)
          );
        })
      );
    } catch (error) {
      this.setError(
        this.errorMessage(error, '无法初始化 Wi-Fi Provisioning 插件')
      );
    }
  }

  private upsertDevice(device: BleDevice): void {
    const index = this.devices.findIndex((item) => item.id === device.id);
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

  private releasePlugin(): Promise<void> {
    if (!this.nativeSupported) return Promise.resolve();
    if (!this.pluginRelease) this.pluginRelease = this.releasePluginNow();
    return this.pluginRelease;
  }

  private async releasePluginNow(): Promise<void> {
    await Promise.allSettled([WiFiProv.stopBleScan(), WiFiProv.clearState()]);
    await Promise.allSettled(
      this.listeners.map((listener) => listener.remove())
    );
    this.listeners = [];
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error) return error;
    return fallback;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2400,
      position: 'bottom',
    });
    await toast.present();
  }
}

function randomBytes(size: number): Uint8Array {
  const output = new Uint8Array(size);
  globalThis.crypto.getRandomValues(output);
  if (!output.some(value => value !== 0)) output[0] = 1;
  return output;
}

function hex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isBootstrapAllocation(value: DeviceAllocation): value is BootstrapAllocation {
  return value.preserveAccess === false && 'controllerSecret' in value;
}
