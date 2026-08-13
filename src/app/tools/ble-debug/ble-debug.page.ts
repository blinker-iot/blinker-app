import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import { IonicModule, ToastController } from '@ionic/angular';
import {
  BleCharacteristic,
  BleDescriptor,
  BleClient,
  BleDevice,
  BleService,
  ConnectionPriority,
  ScanMode,
  ScanResult,
  dataViewToHexString,
  dataViewToText,
} from '@capacitor-community/bluetooth-le';

type DataMode = 'hex' | 'text' | 'decimal';
type DeviceSort = 'signal' | 'name' | 'recent';
type LogFilter = 'all' | 'data' | 'system' | 'error';
type BleScreen =
  | 'scanner'
  | 'advertisement'
  | 'overview'
  | 'gatt'
  | 'characteristic'
  | 'chart'
  | 'log';
type BlePermissionProblem = 'permission' | 'location' | undefined;

interface DebugDevice extends BleDevice {
  localName?: string;
  rssi?: number;
  txPower?: number;
  manufacturerData?: Record<string, DataView>;
  serviceData?: Record<string, DataView>;
  rawAdvertisement?: DataView;
  lastSeen: number;
  seenCount: number;
  rssiHistory: number[];
}

interface DebugLog {
  id: number;
  timestamp: number;
  time: string;
  type: 'system' | 'rx' | 'tx' | 'error';
  title: string;
  value?: string;
}

interface CharacteristicValue {
  hex: string;
  text: string;
  decimal: string;
  byteLength: number;
  time: string;
}

interface WriteHistoryItem {
  mode: 'hex' | 'text';
  value: string;
}

const STANDARD_NAMES: Record<string, string> = {
  '1800': '通用访问',
  '1801': '通用属性',
  '1805': '当前时间',
  '1809': '健康温度计',
  '180a': '设备信息',
  '180d': '心率',
  '180f': '电池服务',
  '1812': '人机接口设备',
  '1816': '骑行速度与踏频',
  '181a': '环境感知',
  '2a00': '设备名称',
  '2a01': '外观',
  '2a05': '服务已更改',
  '2a19': '电池电量',
  '2a24': '型号',
  '2a25': '序列号',
  '2a26': '固件版本',
  '2a27': '硬件版本',
  '2a28': '软件版本',
  '2a29': '制造商名称',
  '2a37': '心率测量',
  '2a38': '身体传感器位置',
  '2a6e': '温度',
  '2a6f': '湿度',
  '2900': '扩展属性',
  '2901': '用户描述',
  '2902': '客户端配置',
  '2904': '数据格式',
};

@Component({
  selector: 'app-ble-debug',
  templateUrl: './ble-debug.page.html',
  styleUrls: ['./ble-debug.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonicModule],
})
export class BleDebugPage implements OnInit, OnDestroy {
  devices: DebugDevice[] = [];
  connectedDevice?: DebugDevice;
  services: BleService[] = [];
  logs: DebugLog[] = [];
  screen: BleScreen = 'scanner';
  selectedDevice?: DebugDevice;
  selectedService?: BleService;
  selectedCharacteristic?: BleCharacteristic;
  showMoreMenu = false;

  isScanning = false;
  isRefreshingGatt = false;
  connectingId = '';
  searchKeyword = '';
  showUnnamed = true;
  showFavoritesOnly = false;
  showScanFilters = false;
  minimumRssi = -100;
  deviceSort: DeviceSort = 'signal';
  expandedDevices = new Set<string>();
  expandedServices = new Set<string>();
  expandedCharacteristics = new Set<string>();
  notifyingCharacteristics = new Set<string>();
  favoriteDeviceIds = new Set<string>();
  busyOperations = new Set<string>();

  activeTab: 'gatt' | 'log' = 'gatt';
  valueMode: DataMode = 'hex';
  logFilter: LogFilter = 'all';
  diagnosticMode: 'event' | 'rssi' = 'event';
  connectionMtu?: number;
  connectionRssi?: number;
  bonded?: boolean;
  connectionPriorityLabel = '默认';
  connectedRssiHistory: number[] = [];
  scanElapsedSeconds = 0;
  permissionProblem: BlePermissionProblem;
  permissionMessage = '';

  writeTarget?: { service: BleService; characteristic: BleCharacteristic };
  writeMode: 'hex' | 'text' = 'hex';
  writeValue = '';
  writeWithoutResponse = false;
  appendNewline = false;
  writeHistory: WriteHistoryItem[] = [];
  characteristicValues: Record<string, CharacteristicValue> = {};
  characteristicHistories: Record<string, CharacteristicValue[]> = {};

  readonly isWeb = Capacitor.getPlatform() === 'web';
  readonly isAndroid = Capacitor.getPlatform() === 'android';
  private initialized = false;
  private scanTimer?: ReturnType<typeof setTimeout>;
  private scanElapsedTimer?: ReturnType<typeof setInterval>;
  private rssiMonitorTimer?: ReturnType<typeof setInterval>;
  private logSequence = 0;
  private destroyed = false;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController
  ) {}

  ngOnInit(): void {
    this.favoriteDeviceIds = new Set(
      this.readStorage<string[]>('bleDebugFavorites', [])
    );
    this.writeHistory = this.readStorage<WriteHistoryItem[]>(
      'bleDebugWriteHistory',
      []
    );
    this.addLog(
      'system',
      'BLE 调试器已就绪',
      this.isWeb
        ? 'Web Bluetooth 模式'
        : `${Capacitor.getPlatform().toUpperCase()} 原生模式`
    );
  }

  get visibleDevices(): DebugDevice[] {
    const keyword = this.searchKeyword.trim().toLowerCase();
    return this.devices
      .filter((device) => this.showUnnamed || !!this.deviceName(device))
      .filter((device) => !this.showFavoritesOnly || this.isFavorite(device))
      .filter(
        (device) => device.rssi === undefined || device.rssi >= this.minimumRssi
      )
      .filter((device) => {
        if (!keyword) return true;
        const haystack = [
          this.deviceName(device),
          device.deviceId,
          ...(device.uuids || []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((left, right) => {
        if (this.deviceSort === 'name')
          return this.deviceName(left).localeCompare(
            this.deviceName(right),
            'zh-CN'
          );
        if (this.deviceSort === 'recent') return right.lastSeen - left.lastSeen;
        return (right.rssi ?? -999) - (left.rssi ?? -999);
      });
  }

  get filteredLogs(): DebugLog[] {
    if (this.logFilter === 'all') return this.logs;
    if (this.logFilter === 'data')
      return this.logs.filter((log) => log.type === 'rx' || log.type === 'tx');
    return this.logs.filter((log) => log.type === this.logFilter);
  }

  get timelineLogs(): DebugLog[] {
    return [...this.filteredLogs].reverse();
  }

  get headerTitle(): string {
    const titles: Record<BleScreen, string> = {
      scanner: 'BLE 调试器',
      advertisement: '广播详情',
      overview: '设备概览',
      gatt: 'GATT 服务',
      characteristic: '特征值操作',
      chart: 'RSSI 图表',
      log: '诊断记录',
    };
    return titles[this.screen];
  }

  get currentDevice(): DebugDevice | undefined {
    return this.screen === 'advertisement'
      ? this.selectedDevice
      : this.connectedDevice;
  }

  get scanDuration(): string {
    const minutes = Math.floor(this.scanElapsedSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (this.scanElapsedSeconds % 60).toString().padStart(2, '0');
    return `00:${minutes}:${seconds}`;
  }

  get currentCharacteristicValue(): CharacteristicValue | undefined {
    if (!this.selectedService || !this.selectedCharacteristic) return undefined;
    return this.characteristicValue(
      this.selectedService,
      this.selectedCharacteristic
    );
  }

  get currentCharacteristicHistory(): CharacteristicValue[] {
    if (!this.selectedService || !this.selectedCharacteristic) return [];
    return (
      this.characteristicHistories[
        this.characteristicKey(
          this.selectedService,
          this.selectedCharacteristic
        )
      ] || []
    );
  }

  get connectedAverageRssi(): number | undefined {
    return this.averageRssi(this.connectedRssiHistory);
  }

  get strongestConnectedRssi(): number | string {
    return this.connectedRssiHistory.length
      ? Math.max(...this.connectedRssiHistory)
      : '—';
  }

  get weakestConnectedRssi(): number | string {
    return this.connectedRssiHistory.length
      ? Math.min(...this.connectedRssiHistory)
      : '—';
  }

  get scanButtonLabel(): string {
    if (this.isScanning) return '停止';
    return this.isWeb ? '选择设备' : '扫描';
  }

  get writeByteLength(): number {
    if (!this.writeValue) return 0;
    try {
      return this.encodeWriteValue().byteLength;
    } catch {
      return 0;
    }
  }

  get maximumWriteLength(): number | undefined {
    return this.connectionMtu ? Math.max(0, this.connectionMtu - 3) : undefined;
  }

  async toggleScan(): Promise<void> {
    if (this.isScanning) await this.stopScan();
    else await this.startScan();
  }

  async startScan(): Promise<void> {
    try {
      await this.ensureInitialized();
      this.clearPermissionProblem();
      this.devices = [];

      if (this.isWeb) {
        const device = await BleClient.requestDevice();
        this.upsertDevice({ device });
        this.addLog(
          'system',
          '已选择设备',
          `${device.name || '未命名设备'} · ${device.deviceId}`
        );
        return;
      }

      this.isScanning = true;
      this.screen = 'scanner';
      this.scanElapsedSeconds = 0;
      this.addLog('system', '开始扫描', '低延迟模式 · 自动停止 15 秒');
      await BleClient.requestLEScan(
        { allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY },
        (result) => this.zone.run(() => this.upsertDevice(result))
      );

      this.clearScanTimer();
      this.scanElapsedTimer = setInterval(() => {
        this.scanElapsedSeconds += 1;
        this.markForCheck();
      }, 1000);
      this.scanTimer = setTimeout(() => void this.stopScan(), 15000);
    } catch (error) {
      this.isScanning = false;
      this.capturePermissionProblem(error);
      const message = this.errorMessage(error);
      this.addLog('error', '扫描失败', message);
      await this.showToast(message);
    }
  }

  async stopScan(): Promise<void> {
    this.clearScanTimer();
    if (!this.isScanning) return;

    this.isScanning = false;
    try {
      await BleClient.stopLEScan();
      this.addLog(
        'system',
        '扫描已停止',
        `共发现 ${this.devices.length} 台设备`
      );
    } catch (error) {
      this.addLog('error', '停止扫描失败', this.errorMessage(error));
    }
  }

  async connect(device: DebugDevice): Promise<void> {
    if (this.connectedDevice?.deviceId === device.deviceId) {
      this.screen = 'overview';
      return;
    }
    if (this.connectingId) return;
    await this.stopScan();
    if (this.connectedDevice) await this.disconnect();

    this.connectingId = device.deviceId;
    this.addLog(
      'system',
      '正在连接',
      this.deviceName(device) || device.deviceId
    );
    try {
      await this.ensureInitialized();
      await BleClient.connect(
        device.deviceId,
        (disconnectedId) =>
          this.zone.run(() => this.handleDisconnect(disconnectedId)),
        { timeout: 15000 }
      );

      this.connectedDevice = device;
      this.selectedDevice = device;
      this.screen = 'overview';
      this.services = await BleClient.getServices(device.deviceId);
      const customService = this.services.find(
        (service) => this.uuidName(service.uuid) === '自定义 UUID'
      );
      this.expandedServices = new Set(
        customService
          ? [customService.uuid]
          : this.services[0]
          ? [this.services[0].uuid]
          : []
      );
      this.addLog(
        'system',
        '连接成功',
        `发现 ${this.services.length} 个 GATT 服务`
      );
      await this.loadConnectionInfo();
    } catch (error) {
      this.connectedDevice = undefined;
      this.services = [];
      this.addLog('error', '连接失败', this.errorMessage(error));
      await this.showToast(this.errorMessage(error));
    } finally {
      this.connectingId = '';
      this.markForCheck();
    }
  }

  async disconnect(): Promise<void> {
    const device = this.connectedDevice;
    if (!device) return;

    await this.stopAllNotifications();
    try {
      await BleClient.disconnect(device.deviceId);
    } catch (error) {
      this.addLog('error', '断开连接失败', this.errorMessage(error));
    }
    this.handleDisconnect(device.deviceId);
  }

  async refreshGatt(): Promise<void> {
    if (!this.connectedDevice || this.isRefreshingGatt) return;
    this.isRefreshingGatt = true;
    try {
      if (!this.isWeb)
        await BleClient.discoverServices(this.connectedDevice.deviceId);
      this.services = await BleClient.getServices(
        this.connectedDevice.deviceId
      );
      this.addLog(
        'system',
        '服务已刷新',
        `发现 ${this.services.length} 个 GATT 服务`
      );
    } catch (error) {
      this.addLog('error', '刷新服务失败', this.errorMessage(error));
      await this.showToast(this.errorMessage(error));
    } finally {
      this.isRefreshingGatt = false;
      this.markForCheck();
    }
  }

  async refreshConnectionRssi(): Promise<void> {
    if (!this.connectedDevice || this.isWeb) return;
    const key = `rssi|${this.connectedDevice.deviceId}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    try {
      this.connectionRssi = await BleClient.readRssi(
        this.connectedDevice.deviceId
      );
      this.pushConnectedRssi(this.connectionRssi);
      this.addLog('system', 'RSSI 已更新', `${this.connectionRssi} dBm`);
    } catch (error) {
      this.addLog('error', '读取 RSSI 失败', this.errorMessage(error));
    } finally {
      this.setBusy(key, false);
    }
  }

  async createBond(): Promise<void> {
    if (!this.connectedDevice || !this.isAndroid || this.bonded) return;
    const key = `bond|${this.connectedDevice.deviceId}`;
    this.setBusy(key, true);
    try {
      await BleClient.createBond(this.connectedDevice.deviceId, {
        timeout: 30000,
      });
      this.bonded = await BleClient.isBonded(this.connectedDevice.deviceId);
      this.addLog('system', '设备配对成功', this.connectedDevice.deviceId);
    } catch (error) {
      this.addLog('error', '设备配对失败', this.errorMessage(error));
      await this.showToast(this.errorMessage(error));
    } finally {
      this.setBusy(key, false);
    }
  }

  async setHighPriority(): Promise<void> {
    if (!this.connectedDevice || !this.isAndroid) return;
    try {
      await BleClient.requestConnectionPriority(
        this.connectedDevice.deviceId,
        ConnectionPriority.CONNECTION_PRIORITY_HIGH
      );
      this.connectionPriorityLabel = '高性能';
      this.addLog('system', '连接优先级已更新', '高性能 / 低延迟');
      await this.showToast('已请求高性能连接参数');
    } catch (error) {
      this.addLog('error', '连接参数更新失败', this.errorMessage(error));
    }
  }

  async openAdvertisement(device: DebugDevice): Promise<void> {
    await this.stopScan();
    this.selectedDevice = device;
    this.screen = 'advertisement';
    this.showMoreMenu = false;
  }

  openOverview(): void {
    if (!this.connectedDevice) return;
    this.screen = 'overview';
    this.showMoreMenu = false;
  }

  openConnectedScreen(screen: 'gatt' | 'chart' | 'log'): void {
    if (!this.connectedDevice) return;
    this.screen = screen;
    this.showMoreMenu = false;
  }

  openCharacteristic(
    service: BleService,
    characteristic: BleCharacteristic
  ): void {
    this.selectedService = service;
    this.selectedCharacteristic = characteristic;
    this.valueMode = 'hex';
    this.screen = 'characteristic';
    this.showMoreMenu = false;
    if (this.canWrite(characteristic)) this.openWriter(service, characteristic);
    else this.writeTarget = undefined;
  }

  toggleMoreMenu(): void {
    this.showMoreMenu = !this.showMoreMenu;
  }

  async copyCurrentDeviceId(): Promise<void> {
    if (!this.currentDevice) return;
    this.showMoreMenu = false;
    await this.copyText(this.currentDevice.deviceId, '设备标识已复制');
  }

  async openBleSettings(): Promise<void> {
    if (!this.isAndroid) return;
    try {
      if (this.permissionProblem === 'location')
        await BleClient.openLocationSettings();
      else await BleClient.openAppSettings();
    } catch (error) {
      await this.showToast(this.errorMessage(error));
    }
  }

  async retryBlePermission(): Promise<void> {
    this.initialized = false;
    this.clearPermissionProblem();
    await this.startScan();
  }

  toggleDeviceDetails(device: DebugDevice): void {
    this.expandedDevices = this.toggledSet(
      this.expandedDevices,
      device.deviceId
    );
  }

  isDeviceExpanded(device: DebugDevice): boolean {
    return this.expandedDevices.has(device.deviceId);
  }

  toggleFavorite(event: Event, device: DebugDevice): void {
    event.stopPropagation();
    this.favoriteDeviceIds = this.toggledSet(
      this.favoriteDeviceIds,
      device.deviceId
    );
    localStorage.setItem(
      'bleDebugFavorites',
      JSON.stringify([...this.favoriteDeviceIds])
    );
  }

  isFavorite(device: DebugDevice): boolean {
    return this.favoriteDeviceIds.has(device.deviceId);
  }

  lastSeenLabel(device: DebugDevice): string {
    const seconds = Math.max(
      0,
      Math.round((Date.now() - device.lastSeen) / 1000)
    );
    if (seconds <= 1) return '刚刚';
    if (seconds < 60) return `${seconds} 秒前`;
    return `${Math.floor(seconds / 60)} 分钟前`;
  }

  averageRssi(values: number[]): number | undefined {
    if (!values.length) return undefined;
    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length
    );
  }

  rssiPolyline(values: number[]): string {
    const source =
      values.length > 1
        ? values.slice(-30)
        : [values[0] ?? -60, values[0] ?? -60];
    return source
      .map((value, index) => {
        const x = source.length === 1 ? 0 : (index / (source.length - 1)) * 300;
        const normalized = Math.max(-100, Math.min(-20, value));
        const y = ((-20 - normalized) / 80) * 88;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  toggleService(service: BleService): void {
    this.expandedServices = this.toggledSet(
      this.expandedServices,
      service.uuid
    );
  }

  isServiceExpanded(service: BleService): boolean {
    return this.expandedServices.has(service.uuid);
  }

  toggleCharacteristic(
    service: BleService,
    characteristic: BleCharacteristic
  ): void {
    const key = this.characteristicKey(service, characteristic);
    this.expandedCharacteristics = this.toggledSet(
      this.expandedCharacteristics,
      key
    );
  }

  isCharacteristicExpanded(
    service: BleService,
    characteristic: BleCharacteristic
  ): boolean {
    return this.expandedCharacteristics.has(
      this.characteristicKey(service, characteristic)
    );
  }

  expandAllServices(): void {
    const shouldExpand = this.expandedServices.size !== this.services.length;
    this.expandedServices = new Set(
      shouldExpand ? this.services.map((service) => service.uuid) : []
    );
  }

  async read(
    service: BleService,
    characteristic: BleCharacteristic
  ): Promise<void> {
    if (!this.connectedDevice) return;
    const key = `read|${this.characteristicKey(service, characteristic)}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    try {
      const value = await BleClient.read(
        this.connectedDevice.deviceId,
        service.uuid,
        characteristic.uuid
      );
      this.rememberValue(service, characteristic, value);
      this.addValueLog('rx', '读取响应', service, characteristic, value);
    } catch (error) {
      this.addLog(
        'error',
        `读取 ${this.shortUuid(characteristic.uuid)} 失败`,
        this.errorMessage(error)
      );
    } finally {
      this.setBusy(key, false);
    }
  }

  async readDescriptor(
    service: BleService,
    characteristic: BleCharacteristic,
    descriptor: BleDescriptor
  ): Promise<void> {
    if (!this.connectedDevice) return;
    const key = `descriptor|${service.uuid}|${characteristic.uuid}|${descriptor.uuid}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    try {
      const value = await BleClient.readDescriptor(
        this.connectedDevice.deviceId,
        service.uuid,
        characteristic.uuid,
        descriptor.uuid
      );
      const detail = this.valueDetails(value);
      this.addLog(
        'rx',
        `描述符 ${this.shortUuid(descriptor.uuid)}`,
        `${this.uuidName(descriptor.uuid)}\n${detail}`
      );
    } catch (error) {
      this.addLog(
        'error',
        `读取描述符 ${this.shortUuid(descriptor.uuid)} 失败`,
        this.errorMessage(error)
      );
    } finally {
      this.setBusy(key, false);
    }
  }

  async toggleNotify(
    service: BleService,
    characteristic: BleCharacteristic
  ): Promise<void> {
    if (!this.connectedDevice) return;
    const characteristicKey = this.characteristicKey(service, characteristic);
    const busyKey = `notify|${characteristicKey}`;
    if (this.isBusy(busyKey)) return;
    this.setBusy(busyKey, true);

    try {
      if (this.notifyingCharacteristics.has(characteristicKey)) {
        await BleClient.stopNotifications(
          this.connectedDevice.deviceId,
          service.uuid,
          characteristic.uuid
        );
        const next = new Set(this.notifyingCharacteristics);
        next.delete(characteristicKey);
        this.notifyingCharacteristics = next;
        this.addLog(
          'system',
          '通知已停止',
          this.characteristicLabel(characteristic)
        );
        return;
      }

      await BleClient.startNotifications(
        this.connectedDevice.deviceId,
        service.uuid,
        characteristic.uuid,
        (value) =>
          this.zone.run(() => {
            this.rememberValue(service, characteristic, value);
            this.addValueLog(
              'rx',
              characteristic.properties.indicate
                ? '收到 Indication'
                : '收到 Notification',
              service,
              characteristic,
              value
            );
          })
      );
      this.notifyingCharacteristics = new Set([
        ...this.notifyingCharacteristics,
        characteristicKey,
      ]);
      this.addLog(
        'system',
        '通知已开启',
        this.characteristicLabel(characteristic)
      );
    } catch (error) {
      this.addLog('error', '通知操作失败', this.errorMessage(error));
    } finally {
      this.setBusy(busyKey, false);
    }
  }

  isNotifying(service: BleService, characteristic: BleCharacteristic): boolean {
    return this.notifyingCharacteristics.has(
      this.characteristicKey(service, characteristic)
    );
  }

  openWriter(service: BleService, characteristic: BleCharacteristic): void {
    this.writeTarget = { service, characteristic };
    this.writeWithoutResponse =
      !characteristic.properties.write &&
      characteristic.properties.writeWithoutResponse;
    this.expandedCharacteristics = new Set([
      ...this.expandedCharacteristics,
      this.characteristicKey(service, characteristic),
    ]);
  }

  closeWriter(): void {
    this.writeTarget = undefined;
    this.writeValue = '';
  }

  applyWriteHistory(item: WriteHistoryItem): void {
    this.writeMode = item.mode;
    this.writeValue = item.value;
  }

  async send(): Promise<void> {
    if (!this.connectedDevice || !this.writeTarget) return;
    const { service, characteristic } = this.writeTarget;
    const key = `write|${this.characteristicKey(service, characteristic)}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    try {
      const value = this.encodeWriteValue();
      if (
        this.maximumWriteLength &&
        value.byteLength > this.maximumWriteLength
      ) {
        throw new Error(
          `当前 MTU 建议单次最多写入 ${this.maximumWriteLength} 字节`
        );
      }
      if (this.writeWithoutResponse) {
        await BleClient.writeWithoutResponse(
          this.connectedDevice.deviceId,
          service.uuid,
          characteristic.uuid,
          value
        );
      } else {
        await BleClient.write(
          this.connectedDevice.deviceId,
          service.uuid,
          characteristic.uuid,
          value
        );
      }
      this.rememberValue(service, characteristic, value);
      this.rememberWriteHistory();
      this.addValueLog(
        'tx',
        this.writeWithoutResponse ? '无响应写入' : '写入响应成功',
        service,
        characteristic,
        value
      );
    } catch (error) {
      this.addLog('error', '写入失败', this.errorMessage(error));
      await this.showToast(this.errorMessage(error));
    } finally {
      this.setBusy(key, false);
    }
  }

  characteristicProperties(characteristic: BleCharacteristic): string[] {
    const properties = characteristic.properties;
    const labels: string[] = [];
    if (properties.read) labels.push('READ');
    if (properties.write) labels.push('WRITE');
    if (properties.writeWithoutResponse) labels.push('WRITE NO RESP');
    if (properties.notify) labels.push('NOTIFY');
    if (properties.indicate) labels.push('INDICATE');
    if (properties.broadcast) labels.push('BROADCAST');
    if (properties.authenticatedSignedWrites) labels.push('SIGNED WRITE');
    return labels;
  }

  canWrite(characteristic: BleCharacteristic): boolean {
    return (
      characteristic.properties.write ||
      characteristic.properties.writeWithoutResponse
    );
  }

  deviceName(device: DebugDevice): string {
    return device.localName || device.name || '';
  }

  deviceSignal(device: DebugDevice): 'strong' | 'medium' | 'weak' | 'unknown' {
    if (device.rssi === undefined) return 'unknown';
    if (device.rssi >= -60) return 'strong';
    if (device.rssi >= -78) return 'medium';
    return 'weak';
  }

  manufacturerEntries(
    device: DebugDevice
  ): Array<{ key: string; value: string }> {
    return Object.entries(device.manufacturerData || {}).map(
      ([key, value]) => ({
        key: `0x${Number(key).toString(16).padStart(4, '0').toUpperCase()}`,
        value: this.hexValue(value),
      })
    );
  }

  serviceDataEntries(
    device: DebugDevice
  ): Array<{ key: string; value: string }> {
    return Object.entries(device.serviceData || {}).map(([key, value]) => ({
      key: this.shortUuid(key),
      value: this.hexValue(value),
    }));
  }

  rawAdvertisement(device: DebugDevice): string {
    return device.rawAdvertisement
      ? this.hexValue(device.rawAdvertisement)
      : '';
  }

  advertisedFieldCount(device: DebugDevice): number {
    return (
      (device.uuids?.length || 0) +
      this.manufacturerEntries(device).length +
      this.serviceDataEntries(device).length
    );
  }

  shortUuid(uuid: string): string {
    const short = this.uuid16(uuid);
    return short ? `0x${short.toUpperCase()}` : uuid.toUpperCase();
  }

  uuidName(uuid: string): string {
    const short = this.uuid16(uuid);
    return short
      ? STANDARD_NAMES[short] || 'Bluetooth SIG 标准 UUID'
      : '自定义 UUID';
  }

  serviceLabel(service: BleService): string {
    return this.uuidName(service.uuid) === '自定义 UUID'
      ? '自定义服务'
      : this.uuidName(service.uuid);
  }

  characteristicLabel(characteristic: BleCharacteristic): string {
    return this.uuidName(characteristic.uuid) === '自定义 UUID'
      ? '自定义特征值'
      : this.uuidName(characteristic.uuid);
  }

  characteristicValue(
    service: BleService,
    characteristic: BleCharacteristic
  ): CharacteristicValue | undefined {
    return this.characteristicValues[
      this.characteristicKey(service, characteristic)
    ];
  }

  displayCharacteristicValue(
    service: BleService,
    characteristic: BleCharacteristic
  ): string {
    const value = this.characteristicValue(service, characteristic);
    if (!value) return '';
    return value[this.valueMode];
  }

  displaySnapshot(value: CharacteristicValue): string {
    return value[this.valueMode];
  }

  descriptorBusy(
    service: BleService,
    characteristic: BleCharacteristic,
    descriptor: BleDescriptor
  ): boolean {
    return this.isBusy(
      `descriptor|${service.uuid}|${characteristic.uuid}|${descriptor.uuid}`
    );
  }

  operationBusy(
    operation: string,
    service: BleService,
    characteristic: BleCharacteristic
  ): boolean {
    return this.isBusy(
      `${operation}|${this.characteristicKey(service, characteristic)}`
    );
  }

  isBusy(key: string): boolean {
    return this.busyOperations.has(key);
  }

  clearLogs(): void {
    this.logs = [];
  }

  async copyText(value: string, successMessage = '已复制'): Promise<void> {
    try {
      await Clipboard.write({ string: value });
      await this.showToast(successMessage);
    } catch (error) {
      await this.showToast(this.errorMessage(error));
    }
  }

  async copyLogs(): Promise<void> {
    if (!this.filteredLogs.length) return;
    const text = [...this.filteredLogs]
      .reverse()
      .map(
        (log) =>
          `${log.time} [${log.type.toUpperCase()}] ${log.title}${
            log.value ? `\n${log.value}` : ''
          }`
      )
      .join('\n');
    await this.copyText(text, `已复制 ${this.filteredLogs.length} 条日志`);
  }

  async exportLogs(): Promise<void> {
    if (!this.timelineLogs.length) return;
    const text = this.timelineLogs
      .map(
        (log) =>
          `${log.time} [${log.type.toUpperCase()}] ${log.title}${
            log.value ? `\n${log.value}` : ''
          }`
      )
      .join('\n');
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ble-debug-${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.log`;
      anchor.click();
      URL.revokeObjectURL(url);
      await this.showToast('诊断日志已导出');
    } catch {
      await this.copyText(text, '导出不可用，日志已复制');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearScanTimer();
    this.stopRssiMonitor();
    void this.cleanup();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      try {
        // 本工具不通过 BLE 扫描结果推导用户位置。Android 12+ 因此只需
        // “附近的设备”权限；Android 11 及以下仍由系统请求定位权限。
        await BleClient.initialize({ androidNeverForLocation: true });
        this.initialized = true;
      } catch (error) {
        this.capturePermissionProblem(error);
        throw error;
      }
    }

    const enabled = await BleClient.isEnabled();
    if (!enabled && this.isAndroid) await BleClient.requestEnable();
    else if (!enabled) throw new Error('请先开启系统蓝牙');

    if (this.isAndroid && this.androidNeedsLegacyLocation()) {
      const locationEnabled = await BleClient.isLocationEnabled().catch(
        () => true
      );
      if (!locationEnabled) {
        this.permissionProblem = 'location';
        this.permissionMessage =
          'Android 11 及以下需要同时开启系统定位服务，才能发现 BLE 设备。';
        throw new Error(this.permissionMessage);
      }
    }
  }

  private async loadConnectionInfo(): Promise<void> {
    if (!this.connectedDevice) return;
    const deviceId = this.connectedDevice.deviceId;
    const tasks: Promise<void>[] = [];
    if (!this.isWeb) {
      tasks.push(
        BleClient.getMtu(deviceId)
          .then((value) => {
            this.connectionMtu = value;
          })
          .catch(() => undefined),
        BleClient.readRssi(deviceId)
          .then((value) => {
            this.connectionRssi = value;
          })
          .catch(() => undefined)
      );
    }
    if (this.isAndroid) {
      tasks.push(
        BleClient.isBonded(deviceId)
          .then((value) => {
            this.bonded = value;
          })
          .catch(() => undefined)
      );
    }
    await Promise.all(tasks);
    if (this.connectionRssi !== undefined)
      this.pushConnectedRssi(this.connectionRssi);
    this.startRssiMonitor();
    this.markForCheck();
  }

  private upsertDevice(result: ScanResult): void {
    const index = this.devices.findIndex(
      (device) => device.deviceId === result.device.deviceId
    );
    const previous = index >= 0 ? this.devices[index] : undefined;
    const incoming: DebugDevice = {
      ...previous,
      ...result.device,
      localName: result.localName || previous?.localName,
      rssi: result.rssi ?? previous?.rssi,
      txPower: result.txPower ?? previous?.txPower,
      uuids: result.uuids || result.device.uuids || previous?.uuids,
      manufacturerData: result.manufacturerData || previous?.manufacturerData,
      serviceData: result.serviceData || previous?.serviceData,
      rawAdvertisement: result.rawAdvertisement || previous?.rawAdvertisement,
      lastSeen: Date.now(),
      seenCount: (previous?.seenCount || 0) + 1,
      rssiHistory:
        result.rssi === undefined
          ? previous?.rssiHistory || []
          : [...(previous?.rssiHistory || []), result.rssi].slice(-30),
    };
    const next = [...this.devices];
    if (index >= 0) next[index] = incoming;
    else next.push(incoming);
    this.devices = next;
    this.markForCheck();
  }

  private handleDisconnect(deviceId: string): void {
    if (this.connectedDevice?.deviceId !== deviceId) return;
    this.addLog(
      'system',
      '设备已断开',
      this.deviceName(this.connectedDevice) || deviceId
    );
    this.connectedDevice = undefined;
    this.services = [];
    this.writeTarget = undefined;
    this.notifyingCharacteristics = new Set();
    this.expandedCharacteristics = new Set();
    this.connectionMtu = undefined;
    this.connectionRssi = undefined;
    this.bonded = undefined;
    this.connectionPriorityLabel = '默认';
    this.connectedRssiHistory = [];
    this.stopRssiMonitor();
    this.screen = 'scanner';
    if (!this.destroyed) this.markForCheck();
  }

  private encodeWriteValue(): DataView {
    if (this.writeMode === 'text') {
      const text = this.writeValue + (this.appendNewline ? '\n' : '');
      const bytes = new TextEncoder().encode(text);
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    const cleaned = this.writeValue.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
    if (
      !cleaned ||
      !/^[0-9a-fA-F]+$/.test(cleaned) ||
      cleaned.length % 2 !== 0
    ) {
      throw new Error('HEX 数据应由完整的十六进制字节组成，例如 01 A0 FF');
    }
    const bytes = Uint8Array.from(cleaned.match(/.{2}/g) || [], (item) =>
      parseInt(item, 16)
    );
    return new DataView(bytes.buffer);
  }

  private rememberWriteHistory(): void {
    const item: WriteHistoryItem = {
      mode: this.writeMode,
      value: this.writeValue,
    };
    this.writeHistory = [
      item,
      ...this.writeHistory.filter(
        (history) => history.mode !== item.mode || history.value !== item.value
      ),
    ].slice(0, 6);
    localStorage.setItem(
      'bleDebugWriteHistory',
      JSON.stringify(this.writeHistory)
    );
  }

  private rememberValue(
    service: BleService,
    characteristic: BleCharacteristic,
    value: DataView
  ): void {
    const key = this.characteristicKey(service, characteristic);
    const snapshot = this.valueSnapshot(value);
    this.characteristicValues = {
      ...this.characteristicValues,
      [key]: snapshot,
    };
    this.characteristicHistories = {
      ...this.characteristicHistories,
      [key]: [snapshot, ...(this.characteristicHistories[key] || [])].slice(
        0,
        5
      ),
    };
  }

  private valueSnapshot(value: DataView): CharacteristicValue {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
    let text = '';
    try {
      text = dataViewToText(value).replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
        '·'
      );
    } catch {
      text = '';
    }
    return {
      hex: this.hexValue(value) || '—',
      text: text || '—',
      decimal: [...bytes].join(', ') || '—',
      byteLength: value.byteLength,
      time: this.preciseTime(new Date()),
    };
  }

  private valueDetails(value: DataView): string {
    const snapshot = this.valueSnapshot(value);
    return `HEX  ${snapshot.hex}\nTEXT ${snapshot.text}\nDEC  ${snapshot.decimal}`;
  }

  private addValueLog(
    type: 'rx' | 'tx',
    title: string,
    service: BleService,
    characteristic: BleCharacteristic,
    value: DataView
  ): void {
    const detail = `${this.serviceLabel(service)} / ${this.characteristicLabel(
      characteristic
    )}\n${this.valueDetails(value)}`;
    this.addLog(type, title, detail);
  }

  private addLog(type: DebugLog['type'], title: string, value?: string): void {
    const now = new Date();
    this.logs = [
      {
        id: ++this.logSequence,
        timestamp: now.getTime(),
        time: this.preciseTime(now),
        type,
        title,
        value,
      },
      ...this.logs,
    ].slice(0, 300);
    if (!this.destroyed) this.markForCheck();
  }

  private hexValue(value: DataView): string {
    return dataViewToHexString(value)
      .toUpperCase()
      .replace(/(.{2})/g, '$1 ')
      .trim();
  }

  private uuid16(uuid: string): string | undefined {
    const normalized = uuid.toLowerCase();
    const standardMatch = normalized.match(
      /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/
    );
    if (standardMatch) return standardMatch[1];
    return /^[0-9a-f]{4}$/.test(normalized) ? normalized : undefined;
  }

  private characteristicKey(
    service: BleService,
    characteristic: BleCharacteristic
  ): string {
    return `${service.uuid}|${characteristic.uuid}`;
  }

  private async stopAllNotifications(): Promise<void> {
    if (!this.connectedDevice) return;
    const deviceId = this.connectedDevice.deviceId;
    const tasks = [...this.notifyingCharacteristics].map((key) => {
      const [service, characteristic] = key.split('|');
      return BleClient.stopNotifications(deviceId, service, characteristic);
    });
    await Promise.allSettled(tasks);
    this.notifyingCharacteristics = new Set();
  }

  private async cleanup(): Promise<void> {
    await this.stopScan();
    await this.disconnect();
  }

  private startRssiMonitor(): void {
    this.stopRssiMonitor();
    if (!this.connectedDevice || this.isWeb) return;
    this.rssiMonitorTimer = setInterval(() => {
      const deviceId = this.connectedDevice?.deviceId;
      if (!deviceId) return;
      void BleClient.readRssi(deviceId)
        .then((value) =>
          this.zone.run(() => {
            this.connectionRssi = value;
            this.pushConnectedRssi(value);
            this.markForCheck();
          })
        )
        .catch(() => undefined);
    }, 2000);
  }

  private stopRssiMonitor(): void {
    if (this.rssiMonitorTimer) clearInterval(this.rssiMonitorTimer);
    this.rssiMonitorTimer = undefined;
  }

  private pushConnectedRssi(value: number): void {
    this.connectedRssiHistory = [...this.connectedRssiHistory, value].slice(
      -30
    );
  }

  private setBusy(key: string, busy: boolean): void {
    const next = new Set(this.busyOperations);
    if (busy) next.add(key);
    else next.delete(key);
    this.busyOperations = next;
    this.markForCheck();
  }

  private toggledSet(source: Set<string>, key: string): Set<string> {
    const next = new Set(source);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    if (this.scanElapsedTimer) clearInterval(this.scanElapsedTimer);
    this.scanTimer = undefined;
    this.scanElapsedTimer = undefined;
  }

  private preciseTime(date: Date): string {
    const base = date.toLocaleTimeString('zh-CN', { hour12: false });
    return `${base}.${date.getMilliseconds().toString().padStart(3, '0')}`;
  }

  private readStorage<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(key) || '') as T;
    } catch {
      return fallback;
    }
  }

  private androidNeedsLegacyLocation(): boolean {
    const match = navigator.userAgent.match(/Android\s([0-9]+)/i);
    return !!match && Number(match[1]) < 12;
  }

  private capturePermissionProblem(error: unknown): void {
    if (!this.isAndroid) return;
    const rawMessage =
      error instanceof Error ? error.message : String(error || '');
    if (
      !/permission|denied|fine[ _-]?location|bluetooth_scan|bluetooth_connect/i.test(
        rawMessage
      )
    )
      return;
    this.permissionProblem = 'permission';
    this.permissionMessage = this.androidNeedsLegacyLocation()
      ? '请允许“位置信息”权限。Android 11 及以下使用 BLE 扫描时由系统强制要求该权限。'
      : '请允许“附近的设备”权限；Android 12 及以上不再需要位置信息权限。';
    this.markForCheck();
  }

  private clearPermissionProblem(): void {
    this.permissionProblem = undefined;
    this.permissionMessage = '';
  }

  private errorMessage(error: unknown): string {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : '';
    if (
      /permission|denied|fine[ _-]?location|bluetooth_scan|bluetooth_connect/i.test(
        message
      )
    ) {
      return (
        this.permissionMessage || '缺少蓝牙扫描权限，请在系统设置中授权后重试'
      );
    }
    if (message) return message;
    return '操作失败，请检查蓝牙权限后重试';
  }

  private markForCheck(): void {
    if (!this.destroyed) this.cdr.markForCheck();
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'bottom',
    });
    await toast.present();
  }
}
