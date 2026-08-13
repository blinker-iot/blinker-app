import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import {
  BleClient,
  BleDevice,
  ConnectionPriority,
  ScanMode,
  ScanResult,
} from '@capacitor-community/bluetooth-le';
import {
  BLE_OTA_COMMAND_CHARACTERISTIC_UUID,
  BLE_OTA_FIRMWARE_CHARACTERISTIC_UUID,
  BLE_OTA_SERVICE_UUID,
  OTA_ACK_CRC_ERROR,
  OTA_ACK_INDEX_ERROR,
  OTA_ACK_OK,
  OTA_ACK_SIGNATURE_ERROR,
  OTA_ACK_START_ERROR,
  OTA_COMMAND_ACK,
  OTA_COMMAND_START_FILESYSTEM,
  OTA_COMMAND_START_FLASH,
  OTA_COMMAND_STOP,
  OTA_SECTOR_SIZE,
  buildCommandFrame,
  buildSectorPackets,
  bytesToDataView,
  dataViewToBytes,
  formatBytes,
  isValidCrcFrame,
  readUint16LE,
} from '../ota/ota-protocol';

type BleOtaState =
  | 'idle'
  | 'connecting'
  | 'starting'
  | 'uploading'
  | 'verifying'
  | 'success'
  | 'error'
  | 'cancelled';
type BleOtaUpdateType = 'flash' | 'filesystem';

interface OtaDevice extends BleDevice {
  localName?: string;
  rssi?: number;
  lastSeen: number;
}

interface CommandAck {
  commandId: number;
  status: number;
}

interface SectorAck {
  sectorIndex: number;
  status: number;
  expectedIndex: number;
}

interface PendingAck<T> {
  resolve: (ack: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MAX_FIRMWARE_SIZE = 32 * 1024 * 1024;
const COMMAND_ACK_TIMEOUT = 15000;
const STOP_ACK_TIMEOUT = 45000;
const SECTOR_ACK_TIMEOUT = 15000;

@Component({
  selector: 'app-ble-ota',
  templateUrl: './ble-ota.page.html',
  styleUrls: ['./ble-ota.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonicModule, HeroCardComponent],
})
export class BleOtaPage implements OnDestroy {
  devices: OtaDevice[] = [];
  selectedDevice?: OtaDevice;
  firmwareFile?: File;
  updateType: BleOtaUpdateType = 'flash';

  state: BleOtaState = 'idle';
  progress = 0;
  statusMessage = '请选择固件和 OTA 设备';
  statusDetail = '';
  bytesSent = 0;
  speed = 0;
  currentSector = 0;
  sectorCount = 0;
  isScanning = false;
  connectingId = '';

  readonly isWeb = Capacitor.getPlatform() === 'web';
  readonly isAndroid = Capacitor.getPlatform() === 'android';
  readonly formatBytes = formatBytes;

  private initialized = false;
  private connectedId = '';
  private notificationsActive = false;
  private cancelRequested = false;
  private scanTimer?: ReturnType<typeof setTimeout>;
  private pendingCommand?: PendingAck<CommandAck> & { commandId: number };
  private pendingSector?: PendingAck<SectorAck> & { sectorIndex: number };

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController
  ) {}

  get isBusy(): boolean {
    return ['connecting', 'starting', 'uploading', 'verifying'].includes(
      this.state
    );
  }

  get canUpload(): boolean {
    return !!this.firmwareFile && !!this.selectedDevice && !this.isBusy;
  }

  get scanButtonLabel(): string {
    if (this.isScanning) return '停止扫描';
    return this.isWeb ? '选择 OTA 设备' : '扫描 OTA 设备';
  }

  get speedText(): string {
    return this.speed ? `${formatBytes(this.speed)}/s` : '—';
  }

  async chooseFirmware(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.bin')) {
      await this.showToast('请选择 .bin 固件文件');
      return;
    }
    if (!file.size) {
      await this.showToast('固件文件为空');
      return;
    }
    if (file.size > MAX_FIRMWARE_SIZE) {
      await this.showToast('固件文件不能超过 32 MB');
      return;
    }

    this.firmwareFile = file;
    this.resetStatus('固件已就绪，请选择 OTA 设备');
  }

  clearFirmware(): void {
    if (this.isBusy) return;
    this.firmwareFile = undefined;
    this.resetStatus('请选择固件和 OTA 设备');
  }

  async toggleScan(): Promise<void> {
    if (this.isScanning) await this.stopScan();
    else await this.startScan();
  }

  async startScan(): Promise<void> {
    if (this.isBusy) return;

    try {
      await this.ensureInitialized();
      this.devices = [];

      if (this.isWeb) {
        const device = await BleClient.requestDevice({
          services: [BLE_OTA_SERVICE_UUID],
        });
        const otaDevice: OtaDevice = { ...device, lastSeen: Date.now() };
        this.devices = [otaDevice];
        this.selectedDevice = otaDevice;
        this.resetStatus(`已选择 ${this.deviceName(otaDevice)}`);
        return;
      }

      this.isScanning = true;
      this.statusMessage = '正在扫描 BLE OTA 设备…';
      await BleClient.requestLEScan(
        {
          services: [BLE_OTA_SERVICE_UUID],
          allowDuplicates: true,
          scanMode: ScanMode.SCAN_MODE_LOW_LATENCY,
        },
        (result) => this.zone.run(() => this.upsertDevice(result))
      );

      this.clearScanTimer();
      this.scanTimer = setTimeout(() => void this.stopScan(), 12000);
    } catch (error) {
      this.isScanning = false;
      const message = this.errorMessage(error);
      this.state = 'error';
      this.statusMessage = '扫描失败';
      this.statusDetail = message;
      await this.showToast(message);
    }
  }

  async stopScan(): Promise<void> {
    this.clearScanTimer();
    if (!this.isScanning) return;

    this.isScanning = false;
    try {
      await BleClient.stopLEScan();
      this.statusMessage = this.devices.length
        ? `发现 ${this.devices.length} 台 OTA 设备`
        : '未发现 OTA 设备';
      this.statusDetail = this.devices.length
        ? '请选择设备后开始升级'
        : '请确认设备已进入 BLE OTA 模式';
    } catch {
      // The native scanner may already have stopped when the timeout fires.
    }
  }

  selectDevice(device: OtaDevice): void {
    if (this.isBusy) return;
    this.selectedDevice = device;
    this.resetStatus(`已选择 ${this.deviceName(device)}`);
  }

  async upload(): Promise<void> {
    if (!this.canUpload || !this.firmwareFile || !this.selectedDevice) return;

    this.cancelRequested = false;
    this.bytesSent = 0;
    this.speed = 0;
    this.progress = 0;
    const startedAt = Date.now();

    try {
      await this.stopScan();
      this.setState(
        'connecting',
        0,
        '正在连接 OTA 设备',
        this.deviceName(this.selectedDevice)
      );
      await this.connect(this.selectedDevice);
      this.throwIfCancelled();

      const firmware = new Uint8Array(await this.firmwareFile.arrayBuffer());
      const packetSize = await this.getPacketSize();
      this.sectorCount = Math.ceil(firmware.byteLength / OTA_SECTOR_SIZE);
      this.setState(
        'starting',
        2,
        '正在启动 OTA 会话',
        `BLE 包大小 ${packetSize} 字节`
      );

      await this.sendCommand(
        this.updateType === 'filesystem'
          ? OTA_COMMAND_START_FILESYSTEM
          : OTA_COMMAND_START_FLASH,
        firmware.byteLength
      );
      await this.sendFirmware(firmware, packetSize, startedAt);

      this.throwIfCancelled();
      this.setState('verifying', 99, '设备正在校验固件', '请保持设备供电稳定');
      await this.sendStopCommand();

      const elapsedMs = Math.max(Date.now() - startedAt, 1);
      this.bytesSent = firmware.byteLength;
      this.speed = Math.round(firmware.byteLength / (elapsedMs / 1000));
      this.setState(
        'success',
        100,
        'OTA 升级完成',
        `已发送 ${formatBytes(firmware.byteLength)}，设备将自动重启`
      );
    } catch (error) {
      if (this.cancelRequested) {
        this.setState(
          'cancelled',
          this.progress,
          '升级已取消',
          '未完成的固件不会被启用'
        );
      } else {
        this.setState(
          'error',
          this.progress,
          'OTA 升级失败',
          this.errorMessage(error)
        );
      }
    } finally {
      if (this.state !== 'success') await this.disconnect();
    }
  }

  async cancelUpload(): Promise<void> {
    if (!this.isBusy) return;
    this.cancelRequested = true;
    this.rejectPendingAcks(new Error('升级已取消'));
    await this.disconnect();
  }

  deviceName(device: OtaDevice): string {
    return device.localName || device.name || '未命名 OTA 设备';
  }

  signalIcon(rssi?: number): string {
    if (rssi === undefined || rssi < -88)
      return 'fa-light fa-signal-bars-slash';
    if (rssi < -74) return 'fa-light fa-signal-bars-weak';
    if (rssi < -60) return 'fa-light fa-signal-bars-fair';
    return 'fa-light fa-signal-bars-good';
  }

  ngOnDestroy(): void {
    this.cancelRequested = true;
    this.clearScanTimer();
    this.rejectPendingAcks(new Error('页面已关闭'));
    void this.stopScan();
    void this.disconnect();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await BleClient.initialize({ androidNeverForLocation: true });
      this.initialized = true;
    }

    const enabled = await BleClient.isEnabled();
    if (!enabled && this.isAndroid) await BleClient.requestEnable();
    else if (!enabled) throw new Error('请先打开蓝牙');
  }

  private upsertDevice(result: ScanResult): void {
    const id = result.device.deviceId;
    const current = this.devices.find((device) => device.deviceId === id);
    const next: OtaDevice = {
      ...(current || result.device),
      ...result.device,
      localName: result.localName || current?.localName,
      rssi: result.rssi ?? current?.rssi,
      lastSeen: Date.now(),
    };

    this.devices = [
      next,
      ...this.devices.filter((device) => device.deviceId !== id),
    ].sort((left, right) => (right.rssi ?? -999) - (left.rssi ?? -999));
    if (this.selectedDevice?.deviceId === id) this.selectedDevice = next;
    this.cdr.detectChanges();
  }

  private async connect(device: OtaDevice): Promise<void> {
    await this.ensureInitialized();
    if (this.connectedId === device.deviceId && this.notificationsActive)
      return;
    await this.disconnect();

    this.connectingId = device.deviceId;
    try {
      await BleClient.connect(
        device.deviceId,
        (disconnectedId) =>
          this.zone.run(() => this.handleDisconnect(disconnectedId)),
        { timeout: 15000 }
      );
      this.connectedId = device.deviceId;

      if (this.isAndroid) {
        await BleClient.requestConnectionPriority(
          device.deviceId,
          ConnectionPriority.CONNECTION_PRIORITY_HIGH
        ).catch(() => undefined);
      }

      await BleClient.startNotifications(
        device.deviceId,
        BLE_OTA_SERVICE_UUID,
        BLE_OTA_COMMAND_CHARACTERISTIC_UUID,
        (value) => this.zone.run(() => this.handleCommandNotification(value))
      );
      await BleClient.startNotifications(
        device.deviceId,
        BLE_OTA_SERVICE_UUID,
        BLE_OTA_FIRMWARE_CHARACTERISTIC_UUID,
        (value) => this.zone.run(() => this.handleFirmwareNotification(value))
      );
      this.notificationsActive = true;
    } finally {
      this.connectingId = '';
    }
  }

  private async disconnect(): Promise<void> {
    const deviceId = this.connectedId;
    this.connectedId = '';

    if (!deviceId) return;
    if (this.notificationsActive) {
      await BleClient.stopNotifications(
        deviceId,
        BLE_OTA_SERVICE_UUID,
        BLE_OTA_COMMAND_CHARACTERISTIC_UUID
      ).catch(() => undefined);
      await BleClient.stopNotifications(
        deviceId,
        BLE_OTA_SERVICE_UUID,
        BLE_OTA_FIRMWARE_CHARACTERISTIC_UUID
      ).catch(() => undefined);
    }
    this.notificationsActive = false;
    await BleClient.disconnect(deviceId).catch(() => undefined);
  }

  private handleDisconnect(deviceId: string): void {
    if (deviceId !== this.connectedId) return;
    this.connectedId = '';
    this.notificationsActive = false;
    this.rejectPendingAcks(new Error('OTA 设备连接已断开'));
    this.cdr.detectChanges();
  }

  private handleCommandNotification(value: DataView): void {
    const data = dataViewToBytes(value);
    if (
      data.byteLength < 20 ||
      !isValidCrcFrame(data) ||
      readUint16LE(data, 0) !== OTA_COMMAND_ACK
    )
      return;

    const ack: CommandAck = {
      commandId: readUint16LE(data, 2),
      status: readUint16LE(data, 4),
    };
    if (!this.pendingCommand || this.pendingCommand.commandId !== ack.commandId)
      return;

    const pending = this.pendingCommand;
    this.pendingCommand = undefined;
    clearTimeout(pending.timer);
    pending.resolve(ack);
  }

  private handleFirmwareNotification(value: DataView): void {
    const data = dataViewToBytes(value);
    if (data.byteLength < 20 || !isValidCrcFrame(data)) return;

    const ack: SectorAck = {
      sectorIndex: readUint16LE(data, 0),
      status: readUint16LE(data, 2),
      expectedIndex: readUint16LE(data, 4),
    };
    if (
      !this.pendingSector ||
      this.pendingSector.sectorIndex !== ack.sectorIndex
    )
      return;

    const pending = this.pendingSector;
    this.pendingSector = undefined;
    clearTimeout(pending.timer);
    pending.resolve(ack);
  }

  private async getPacketSize(): Promise<number> {
    if (!this.connectedId) return 20;
    const mtu = await BleClient.getMtu(this.connectedId).catch(() => 23);
    return Math.max(20, Math.min(510, mtu - 3));
  }

  private async sendFirmware(
    firmware: Uint8Array,
    packetSize: number,
    startedAt: number
  ): Promise<void> {
    let sectorIndex = 0;

    while (sectorIndex < this.sectorCount) {
      let accepted = false;
      let lastError: unknown;

      for (let attempt = 0; attempt <= 3 && !accepted; attempt += 1) {
        this.throwIfCancelled();
        const start = sectorIndex * OTA_SECTOR_SIZE;
        const sector = firmware.subarray(
          start,
          Math.min(start + OTA_SECTOR_SIZE, firmware.byteLength)
        );

        try {
          const ack = await this.sendSector(
            sectorIndex,
            sector,
            packetSize,
            firmware.byteLength,
            startedAt
          );
          if (ack.status === OTA_ACK_OK) {
            sectorIndex += 1;
            accepted = true;
          } else if (
            ack.status === OTA_ACK_INDEX_ERROR &&
            ack.expectedIndex < this.sectorCount
          ) {
            sectorIndex = ack.expectedIndex;
            accepted = true;
          } else {
            lastError = new Error(this.ackError(ack.status));
          }
        } catch (error) {
          lastError = error;
          if (this.cancelRequested) throw error;
        }
      }

      if (!accepted)
        throw lastError || new Error(`分片 ${sectorIndex + 1} 多次发送失败`);
    }
  }

  private async sendSector(
    sectorIndex: number,
    sector: Uint8Array,
    packetSize: number,
    totalBytes: number,
    startedAt: number
  ): Promise<SectorAck> {
    const ackPromise = this.waitForSectorAck(sectorIndex);
    const packets = buildSectorPackets(sectorIndex, sector, packetSize);
    let offset = 0;

    try {
      for (let index = 0; index < packets.length; index += 1) {
        this.throwIfCancelled();
        const packet = packets[index];
        await this.writeFirmwarePacket(packet);
        offset += packet.byteLength - 3 - (packet[2] === 0xff ? 2 : 0);

        this.bytesSent = Math.min(
          sectorIndex * OTA_SECTOR_SIZE + offset,
          totalBytes
        );
        this.currentSector = sectorIndex + 1;
        this.progress = Math.max(
          2,
          Math.floor((this.bytesSent / totalBytes) * 98)
        );
        this.speed = Math.round(
          this.bytesSent / (Math.max(Date.now() - startedAt, 1) / 1000)
        );
        this.state = 'uploading';
        this.statusMessage = `正在发送固件 ${Math.floor(
          (this.bytesSent / totalBytes) * 100
        )}%`;
        this.statusDetail = `分片 ${this.currentSector} / ${this.sectorCount}`;

        if ((index + 1) % 8 === 0) await this.delay(0);
      }
    } catch (error) {
      this.rejectPendingSector(this.errorAsError(error));
    }

    return ackPromise;
  }

  private async sendCommand(
    commandId: number,
    totalSize?: number,
    timeout = COMMAND_ACK_TIMEOUT
  ): Promise<void> {
    if (!this.connectedId) throw new Error('OTA 设备未连接');
    const ackPromise = this.waitForCommandAck(commandId, timeout);

    try {
      await BleClient.writeWithoutResponse(
        this.connectedId,
        BLE_OTA_SERVICE_UUID,
        BLE_OTA_COMMAND_CHARACTERISTIC_UUID,
        bytesToDataView(buildCommandFrame(commandId, totalSize))
      );
    } catch (error) {
      this.rejectPendingCommand(this.errorAsError(error));
    }

    const ack = await ackPromise;
    if (ack.status !== OTA_ACK_OK) throw new Error(this.ackError(ack.status));
  }

  private async sendStopCommand(): Promise<void> {
    try {
      await this.sendCommand(OTA_COMMAND_STOP, undefined, STOP_ACK_TIMEOUT);
    } catch (error) {
      if (
        !this.connectedId ||
        /disconnect|not connected|connection closed|gatt.*133/i.test(
          this.errorMessage(error)
        )
      )
        return;
      throw error;
    }
  }

  private async writeFirmwarePacket(packet: Uint8Array): Promise<void> {
    if (!this.connectedId) throw new Error('OTA 设备连接已断开');
    await BleClient.writeWithoutResponse(
      this.connectedId,
      BLE_OTA_SERVICE_UUID,
      BLE_OTA_FIRMWARE_CHARACTERISTIC_UUID,
      bytesToDataView(packet)
    );
  }

  private waitForCommandAck(
    commandId: number,
    timeout: number
  ): Promise<CommandAck> {
    this.rejectPendingCommand(new Error('上一条 OTA 命令已被替换'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommand = undefined;
        reject(new Error(`等待 OTA 命令 0x${commandId.toString(16)} 响应超时`));
      }, timeout);
      this.pendingCommand = { commandId, resolve, reject, timer };
    });
  }

  private waitForSectorAck(sectorIndex: number): Promise<SectorAck> {
    this.rejectPendingSector(new Error('上一分片响应已被替换'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSector = undefined;
        reject(new Error(`等待分片 ${sectorIndex + 1} 响应超时`));
      }, SECTOR_ACK_TIMEOUT);
      this.pendingSector = { sectorIndex, resolve, reject, timer };
    });
  }

  private rejectPendingAcks(error: Error): void {
    this.rejectPendingCommand(error);
    this.rejectPendingSector(error);
  }

  private rejectPendingCommand(error: Error): void {
    const pending = this.pendingCommand;
    if (!pending) return;
    this.pendingCommand = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private rejectPendingSector(error: Error): void {
    const pending = this.pendingSector;
    if (!pending) return;
    this.pendingSector = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private ackError(status: number): string {
    switch (status) {
      case OTA_ACK_CRC_ERROR:
        return '设备报告 CRC 校验失败';
      case OTA_ACK_INDEX_ERROR:
        return '设备报告固件分片序号错误';
      case OTA_ACK_SIGNATURE_ERROR:
        return '设备报告固件签名校验失败';
      case OTA_ACK_START_ERROR:
        return '设备无法启动 OTA 会话';
      default:
        return `设备返回未知错误 0x${status.toString(16)}`;
    }
  }

  private setState(
    state: BleOtaState,
    progress: number,
    message: string,
    detail = ''
  ): void {
    this.state = state;
    this.progress = progress;
    this.statusMessage = message;
    this.statusDetail = detail;
    this.cdr.detectChanges();
  }

  private resetStatus(message: string): void {
    this.state = 'idle';
    this.progress = 0;
    this.statusMessage = message;
    this.statusDetail = '';
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) throw new Error('升级已取消');
  }

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
  }

  private errorAsError(error: unknown): Error {
    return error instanceof Error ? error : new Error(this.errorMessage(error));
  }

  private errorMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error || '未知错误');
    if (/cancel|cancelled|canceled/i.test(message)) return '操作已取消';
    if (/permission|denied|not allowed/i.test(message))
      return '缺少蓝牙权限，请在系统设置中允许“附近的设备”权限';
    if (/not found|service|characteristic/i.test(message))
      return '设备未提供兼容的 BLE OTA 服务';
    return message;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
