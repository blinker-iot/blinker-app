import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor, CapacitorHttp, type HttpResponse, type PluginListenerHandle } from '@capacitor/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { Mdns, type MdnsErrorEvent, type MdnsService, type MdnsWatchEvent } from 'capacitor-mdns';
import { formatBytes } from '../ota/ota-protocol';

type WifiOtaState = 'idle' | 'preparing' | 'uploading' | 'verifying' | 'success' | 'error' | 'cancelled';

interface WifiOtaTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  uploadPath: string;
  username: string;
  password: string;
  txt: Record<string, string>;
}

interface UploadResponse {
  status: number;
  body: string;
}

const MDNS_REQUEST = { type: '_arduino._tcp.', domain: 'local.', addressFamily: 'any' as const };
const MAX_FIRMWARE_SIZE = 64 * 1024 * 1024;
const TARGET_STORAGE_KEY = 'wifiOtaTarget';

@Component({
  selector: 'app-wifi-ota',
  templateUrl: './wifi-ota.page.html',
  styleUrls: ['./wifi-ota.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class WifiOtaPage implements OnInit, OnDestroy {
  firmwareFile?: File;
  targets: WifiOtaTarget[] = [];
  selectedTargetId = '';

  host = '';
  port = 65280;
  uploadPath = '/sketch';
  username = 'arduino';
  password = 'password';
  useHttps = false;
  timeoutSeconds = 60;
  passwordVisible = false;

  state: WifiOtaState = 'idle';
  progress = 0;
  statusMessage = '请选择固件并填写目标地址';
  statusDetail = '';
  isScanning = false;

  readonly isNative = Capacitor.isNativePlatform();
  readonly formatBytes = formatBytes;

  private scanTimer?: ReturnType<typeof setTimeout>;
  private watchStarted = false;
  private discoverListener?: PluginListenerHandle;
  private errorListener?: PluginListenerHandle;
  private scanSession = 0;
  private activeRequest?: XMLHttpRequest;
  private destroyed = false;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController,
  ) {}

  ngOnInit(): void {
    this.restoreTarget();
  }

  get isBusy(): boolean {
    return ['preparing', 'uploading', 'verifying'].includes(this.state);
  }

  get canUpload(): boolean {
    return !!this.firmwareFile && !!this.host.trim() && this.validPort && !this.isBusy;
  }

  get canCancelUpload(): boolean {
    return !!this.activeRequest && this.isBusy;
  }

  get validPort(): boolean {
    return Number.isInteger(Number(this.port)) && Number(this.port) >= 1 && Number(this.port) <= 65535;
  }

  get targetPreview(): string {
    try {
      return this.buildTargetUrl();
    } catch {
      return '目标地址待完善';
    }
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
      await this.showToast('固件文件不能超过 64 MB');
      return;
    }

    this.firmwareFile = file;
    this.resetStatus('固件已就绪，请确认 OTA 目标');
  }

  clearFirmware(): void {
    if (this.isBusy) return;
    this.firmwareFile = undefined;
    this.resetStatus('请选择固件并填写目标地址');
  }

  async toggleDiscovery(): Promise<void> {
    if (this.isScanning) await this.stopDiscovery();
    else await this.startDiscovery();
  }

  async startDiscovery(): Promise<void> {
    if (this.isBusy) return;
    if (!this.isNative) {
      this.state = 'error';
      this.statusMessage = '自动发现不可用';
      this.statusDetail = '浏览器不支持 mDNS 扫描，请手动填写设备地址';
      return;
    }

    await this.stopDiscovery(false);
    const session = ++this.scanSession;
    this.targets = [];
    this.isScanning = true;
    this.statusMessage = '正在搜索局域网 OTA 设备…';
    this.statusDetail = '通过 _arduino._tcp mDNS 服务发现';

    try {
      this.discoverListener = await Mdns.addListener('discover', event => {
        if (session !== this.scanSession || !this.isScanning || !this.isArduinoService(event.service)) return;
        this.zone.run(() => this.handleDiscovery(event));
      });

      this.errorListener = await Mdns.addListener('error', event => {
        if (session !== this.scanSession || !this.isScanning || !this.isArduinoError(event)) return;
        this.zone.run(() => this.handleDiscoveryError(event));
      });

      await Mdns.watch(MDNS_REQUEST);
      if (this.destroyed || session !== this.scanSession || !this.isScanning) {
        await Mdns.unwatch(MDNS_REQUEST).catch(() => undefined);
        await this.removeDiscoveryListeners();
        return;
      }
      this.watchStarted = true;
      this.clearScanTimer();
      this.scanTimer = setTimeout(() => void this.stopDiscovery(), 8000);
    } catch (error) {
      if (session !== this.scanSession) return;
      await this.removeDiscoveryListeners();
      this.isScanning = false;
      this.state = 'error';
      this.statusMessage = '自动发现不可用';
      this.statusDetail = this.errorMessage(error);
      await this.showToast(this.statusDetail);
    }
  }

  async stopDiscovery(updateStatus = true): Promise<void> {
    this.clearScanTimer();
    const wasScanning = this.isScanning;
    this.scanSession += 1;
    this.isScanning = false;

    if (this.watchStarted) {
      this.watchStarted = false;
      await Mdns.unwatch(MDNS_REQUEST).catch(() => undefined);
    }
    await this.removeDiscoveryListeners();

    if (wasScanning && updateStatus) {
      this.statusMessage = this.targets.length ? `发现 ${this.targets.length} 台 OTA 设备` : '未发现 OTA 设备';
      this.statusDetail = this.targets.length ? '选择设备可自动填入连接参数' : '可在下方手动填写 IP 地址';
    }
  }

  selectTarget(target: WifiOtaTarget): void {
    if (this.isBusy) return;
    this.selectedTargetId = target.id;
    this.host = target.host;
    this.port = target.port;
    this.uploadPath = target.uploadPath;
    this.username = target.username;
    this.password = target.password;
    this.resetStatus(`已选择 ${target.name}`);
  }

  toggleHttps(): void {
    if (!this.isBusy) this.useHttps = !this.useHttps;
  }

  async upload(): Promise<void> {
    if (!this.canUpload || !this.firmwareFile) return;

    let targetUrl: string;
    try {
      targetUrl = this.buildTargetUrl();
    } catch (error) {
      await this.showToast(this.errorMessage(error));
      return;
    }

    this.saveTarget();
    this.setState('preparing', 3, '正在准备固件', `${this.firmwareFile.name} · ${formatBytes(this.firmwareFile.size)}`);

    try {
      this.setState('uploading', 8, '正在连接 OTA 设备', targetUrl);
      const response = this.isNative
        ? await this.uploadNative(targetUrl, this.firmwareFile)
        : await this.uploadBrowser(targetUrl, this.firmwareFile);

      this.setState('verifying', 90, '设备正在写入并校验固件', response.body || `HTTP ${response.status}`);
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}：${response.body || '设备拒绝升级'}`);
      }

      this.setState('success', 100, 'WiFi OTA 升级完成', '设备已接收固件并将自动重启');
    } catch (error) {
      if (this.state === 'cancelled') return;
      this.setState('error', this.progress, 'WiFi OTA 升级失败', this.errorMessage(error));
    } finally {
      this.activeRequest = undefined;
    }
  }

  cancelUpload(): void {
    if (!this.activeRequest || !this.isBusy) return;
    this.state = 'cancelled';
    this.statusMessage = '上传已取消';
    this.statusDetail = '设备不会启用未完成的固件';
    this.activeRequest.abort();
    this.activeRequest = undefined;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearScanTimer();
    void this.stopDiscovery();
    this.activeRequest?.abort();
  }

  private handleDiscovery(result: MdnsWatchEvent): void {
    if (this.destroyed || !this.isScanning) return;
    const target = this.serviceToTarget(result.service);
    if (!target) return;

    if (result.action === 'removed') {
      this.targets = this.targets.filter(item => item.id !== target.id);
      return;
    }

    this.targets = [target, ...this.targets.filter(item => item.id !== target.id)]
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    this.cdr.detectChanges();
  }

  private handleDiscoveryError(event: MdnsErrorEvent): void {
    if (event.code !== 'MDNS_WATCH_FAILED') {
      this.statusDetail = this.errorMessage(event);
      this.cdr.detectChanges();
      return;
    }

    this.state = 'error';
    this.statusMessage = '自动发现不可用';
    this.statusDetail = this.errorMessage(event);
    void this.stopDiscovery(false);
  }

  private serviceToTarget(service: MdnsService): WifiOtaTarget | undefined {
    const host = service.ipv4Addresses?.[0]
      || service.ipv6Addresses?.[0]
      || (service.hostname || '').replace(/\.$/, '');
    const port = Number(service.port || 65280);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;

    const txt = service.txtRecord || {};
    const uploadPath = this.txtValue(txt, ['upload_path', 'uploadPath', 'path'], '/sketch');
    return {
      id: `${host}:${port}:${uploadPath}`,
      name: service.name || service.hostname || `${host}:${port}`,
      host,
      port,
      uploadPath: this.normalizePath(uploadPath),
      username: this.txtValue(txt, ['username', 'user'], 'arduino'),
      password: this.txtValue(txt, ['password', 'pass'], 'password'),
      txt,
    };
  }

  private async uploadNative(url: string, file: File): Promise<UploadResponse> {
    const base64 = await this.readFileAsBase64(file);
    this.setState('uploading', 10, '正在发送固件', '原生网络传输进行中，请保持在当前页面');

    const response: HttpResponse = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(file.size),
        ...this.authorizationHeaders(),
      },
      data: base64,
      dataType: 'file',
      responseType: 'text',
      connectTimeout: 15000,
      readTimeout: Math.max(10, Number(this.timeoutSeconds) || 60) * 1000,
      disableRedirects: true,
    });

    return { status: response.status, body: this.responseText(response.data) };
  }

  private uploadBrowser(url: string, file: File): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      this.activeRequest = request;
      request.open('POST', url, true);
      request.timeout = Math.max(10, Number(this.timeoutSeconds) || 60) * 1000;
      request.responseType = 'text';
      request.setRequestHeader('Content-Type', 'application/octet-stream');
      for (const [key, value] of Object.entries(this.authorizationHeaders())) {
        request.setRequestHeader(key, value);
      }

      request.upload.onprogress = event => {
        if (!event.lengthComputable) return;
        this.zone.run(() => {
          const sentPercent = Math.floor((event.loaded / event.total) * 100);
          this.progress = 10 + Math.floor(sentPercent * 0.75);
          this.statusMessage = `正在发送固件 ${sentPercent}%`;
          this.statusDetail = `${formatBytes(event.loaded)} / ${formatBytes(event.total)}`;
          this.cdr.detectChanges();
        });
      };
      request.onload = () => resolve({ status: request.status, body: request.responseText.trim() });
      request.onerror = () => reject(new Error('无法连接 OTA 设备；浏览器模式还需设备允许跨域请求'));
      request.ontimeout = () => reject(new Error(`上传超时（${this.timeoutSeconds} 秒）`));
      request.onabort = () => reject(new Error('上传已取消'));
      request.send(file);
    });
  }

  private buildTargetUrl(): string {
    const host = this.host.trim();
    if (!host) throw new Error('请输入 OTA 设备地址');
    if (!this.validPort) throw new Error('端口必须在 1–65535 之间');

    const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    const path = this.normalizePath(this.uploadPath)
      .split('/')
      .map((part, index) => index === 0 ? '' : encodeURIComponent(part))
      .join('/');
    const url = new URL(`${this.useHttps ? 'https' : 'http'}://${urlHost}:${Number(this.port)}${path}`);
    return url.toString();
  }

  private normalizePath(path: string): string {
    const value = String(path || '/sketch').trim() || '/sketch';
    return value.startsWith('/') ? value : `/${value}`;
  }

  private authorizationHeaders(): Record<string, string> {
    if (!this.username || !this.password) return {};
    const bytes = new TextEncoder().encode(`${this.username}:${this.password}`);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { Authorization: `Basic ${btoa(binary)}` };
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
      };
      reader.onerror = () => reject(reader.error || new Error('读取固件失败'));
      reader.readAsDataURL(file);
    });
  }

  private txtValue(record: Record<string, string>, keys: string[], fallback: string): string {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return fallback;
  }

  private saveTarget(): void {
    localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify({
      host: this.host.trim(),
      port: Number(this.port),
      uploadPath: this.normalizePath(this.uploadPath),
      username: this.username,
      useHttps: this.useHttps,
      timeoutSeconds: Number(this.timeoutSeconds),
    }));
  }

  private restoreTarget(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(TARGET_STORAGE_KEY) || '{}');
      this.host = typeof saved.host === 'string' ? saved.host : '';
      this.port = Number(saved.port) || 65280;
      this.uploadPath = typeof saved.uploadPath === 'string' ? saved.uploadPath : '/sketch';
      this.username = typeof saved.username === 'string' ? saved.username : 'arduino';
      this.useHttps = !!saved.useHttps;
      this.timeoutSeconds = Number(saved.timeoutSeconds) || 60;
    } catch {
      // Invalid legacy settings are ignored.
    }
  }

  private responseText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (value === undefined || value === null) return '';
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  private setState(state: WifiOtaState, progress: number, message: string, detail = ''): void {
    if (this.destroyed) return;
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

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = undefined;
  }

  private isArduinoService(service: MdnsService): boolean {
    return service.type.toLowerCase() === MDNS_REQUEST.type
      && (service.domain || 'local.').toLowerCase() === MDNS_REQUEST.domain;
  }

  private isArduinoError(event: MdnsErrorEvent): boolean {
    if (event.type && event.type.toLowerCase() !== MDNS_REQUEST.type) return false;
    if (event.domain && event.domain.toLowerCase() !== MDNS_REQUEST.domain) return false;
    return true;
  }

  private async removeDiscoveryListeners(): Promise<void> {
    const discoverListener = this.discoverListener;
    const errorListener = this.errorListener;
    this.discoverListener = undefined;
    this.errorListener = undefined;
    await Promise.all([
      discoverListener?.remove().catch(() => undefined),
      errorListener?.remove().catch(() => undefined),
    ]);
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message || '未知错误')
        : String(error || '未知错误');
    if (/permission|denied|ACCESS_LOCAL_NETWORK/i.test(message)) return '缺少局域网访问权限，请在系统设置中授权后重试';
    if (/cleartext.*not permitted/i.test(message)) return '系统阻止了 HTTP 明文连接，请改用 HTTPS 或检查网络权限';
    if (/failed to connect|connection refused|network is unreachable/i.test(message)) return '无法连接 OTA 设备，请确认手机与设备在同一网络';
    if (/timeout|timed out/i.test(message)) return `上传超时（${this.timeoutSeconds} 秒）`;
    return message;
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2200, position: 'bottom' });
    await toast.present();
  }
}
