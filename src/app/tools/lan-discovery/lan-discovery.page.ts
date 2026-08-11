import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { IonicModule, ToastController } from '@ionic/angular';
import { ZeroConf } from 'capacitor-zeroconf';

interface ServiceTypePreset {
  label: string;
  type: string;
  icon: string;
}

interface ZeroConfServiceData {
  domain: string;
  type: string;
  name: string;
  port: number;
  hostname: string;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  txtRecord: Record<string, string>;
}

interface ZeroConfWatchEvent {
  action: 'added' | 'removed' | 'resolved';
  service: ZeroConfServiceData;
}

interface DiscoveredService extends ZeroConfServiceData {
  id: string;
  resolved: boolean;
  lastSeen: number;
}

interface WatchRequest {
  type: string;
  domain: string;
}

interface ConnectionStatus {
  connected: boolean;
  connectionType: string;
}

@Component({
  selector: 'app-lan-discovery',
  templateUrl: './lan-discovery.page.html',
  styleUrls: ['./lan-discovery.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class LanDiscoveryPage implements OnInit, OnDestroy {
  readonly nativeSupported = Capacitor.isNativePlatform();
  readonly serviceTypes: ServiceTypePreset[] = [
    { label: 'HTTP', type: '_http._tcp.', icon: 'fa-globe' },
    { label: 'HTTPS', type: '_https._tcp.', icon: 'fa-lock' },
    { label: 'MQTT', type: '_mqtt._tcp.', icon: 'fa-share-nodes' },
    { label: 'Home Assistant', type: '_home-assistant._tcp.', icon: 'fa-house-signal' },
    { label: 'ESPHome', type: '_esphomelib._tcp.', icon: 'fa-microchip' },
    { label: 'Chromecast', type: '_googlecast._tcp.', icon: 'fa-display' },
    { label: 'AirPlay', type: '_airplay._tcp.', icon: 'fa-airplay' },
    { label: '服务目录', type: '_services._dns-sd._udp.', icon: 'fa-list-tree' },
  ];

  serviceType = this.serviceTypes[0].type;
  domain = 'local.';
  services: DiscoveredService[] = [];
  searchKeyword = '';
  isScanning = false;
  scanElapsed = 0;
  statusMessage = '选择服务类型后开始发现';
  errorMessage = '';
  networkStatus: ConnectionStatus = { connected: false, connectionType: 'unknown' };
  expandedIds = new Set<string>();

  private activeRequest?: WatchRequest;
  private networkListener?: PluginListenerHandle;
  private elapsedTimer?: ReturnType<typeof setInterval>;
  private scanStartedAt = 0;
  private scanSession = 0;
  private destroyed = false;

  constructor(
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController
  ) {}

  get visibleServices(): DiscoveredService[] {
    const keyword = this.searchKeyword.trim().toLowerCase();
    const sorted = [...this.services].sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    if (!keyword) return sorted;

    return sorted.filter(service => this.searchableText(service).includes(keyword));
  }

  get isServiceCatalog(): boolean {
    return this.normalizeType(this.serviceType) === '_services._dns-sd._udp.';
  }

  get networkLabel(): string {
    if (!this.networkStatus.connected) return '未连接网络';
    if (this.networkStatus.connectionType === 'wifi') return 'Wi-Fi 已连接';
    if (this.networkStatus.connectionType === 'cellular') return '当前为移动网络';
    if (this.networkStatus.connectionType === 'ethernet') return '有线网络已连接';
    return '网络已连接';
  }

  get canStartScan(): boolean {
    return this.nativeSupported && this.networkStatus.connected && this.networkStatus.connectionType !== 'cellular';
  }

  async ngOnInit(): Promise<void> {
    await this.refreshNetworkStatus();
    this.networkListener = await Network.addListener('networkStatusChange', status => {
      this.zone.run(() => {
        this.networkStatus = status;
        if (!status.connected && this.isScanning) void this.stopScan();
        this.markForCheck();
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearElapsedTimer();
    void this.releaseResources();
  }

  goBack(): void {
    void this.router.navigate(['/home'], { queryParams: { tab: 'tools' } });
  }

  selectType(type: string): void {
    if (this.isScanning) return;
    this.serviceType = type;
    this.services = [];
    this.expandedIds = new Set<string>();
    this.statusMessage = type === '_services._dns-sd._udp.'
      ? '扫描网络广播的 mDNS 服务类型'
      : `准备发现 ${this.typeLabel(type)} 服务`;
    this.errorMessage = '';
  }

  async toggleScan(): Promise<void> {
    if (this.isScanning) await this.stopScan();
    else await this.startScan();
  }

  async startScan(): Promise<void> {
    if (!this.nativeSupported) {
      await this.showToast('局域网发现需要在 Android 或 iOS App 中使用');
      return;
    }

    await this.refreshNetworkStatus();
    if (!this.networkStatus.connected || this.networkStatus.connectionType === 'cellular') {
      await this.showToast('请先连接到需要发现设备的 Wi-Fi 或有线网络');
      return;
    }

    let normalizedType: string;
    try {
      normalizedType = this.normalizeType(this.serviceType, true);
    } catch (error) {
      await this.showToast(this.readError(error));
      return;
    }

    await this.stopScan(false);
    const request = {
      type: normalizedType,
      domain: this.normalizeDomain(this.domain),
    };
    const session = ++this.scanSession;

    this.serviceType = normalizedType;
    this.activeRequest = request;
    this.services = [];
    this.expandedIds = new Set<string>();
    this.searchKeyword = '';
    this.errorMessage = '';
    this.isScanning = true;
    this.scanStartedAt = Date.now();
    this.scanElapsed = 0;
    this.statusMessage = `正在发现 ${this.typeLabel(normalizedType)} 服务…`;
    this.startElapsedTimer();

    try {
      await ZeroConf.watch(request, event => {
        if (!event || session !== this.scanSession) return;
        this.zone.run(() => this.handleWatchEvent(event as ZeroConfWatchEvent));
      });
    } catch (error) {
      if (session !== this.scanSession) return;
      this.scanSession += 1;
      this.isScanning = false;
      this.clearElapsedTimer();
      this.errorMessage = this.readError(error, '无法启动局域网发现');
      this.statusMessage = '发现启动失败';
      this.activeRequest = undefined;
      await ZeroConf.close().catch(() => undefined);
      this.markForCheck();
    }
  }

  async stopScan(updateStatus = true): Promise<void> {
    const request = this.activeRequest;
    this.activeRequest = undefined;
    this.scanSession += 1;
    this.isScanning = false;
    this.clearElapsedTimer();

    if (request && this.nativeSupported) {
      await ZeroConf.unwatch(request).catch(() => undefined);
      await ZeroConf.close().catch(() => undefined);
    }

    if (updateStatus) {
      this.statusMessage = this.services.length
        ? `发现已停止，共找到 ${this.services.length} 项`
        : '发现已停止，未找到广播该服务的设备';
      this.markForCheck();
    }
  }

  clearResults(): void {
    this.services = [];
    this.expandedIds = new Set<string>();
    this.searchKeyword = '';
    this.statusMessage = this.isScanning ? `正在发现 ${this.typeLabel(this.serviceType)} 服务…` : '发现结果已清空';
  }

  toggleDetails(service: DiscoveredService): void {
    const next = new Set(this.expandedIds);
    if (next.has(service.id)) next.delete(service.id);
    else next.add(service.id);
    this.expandedIds = next;
  }

  isExpanded(service: DiscoveredService): boolean {
    return this.expandedIds.has(service.id);
  }

  primaryAddress(service: DiscoveredService): string {
    return service.ipv4Addresses[0] || service.ipv6Addresses[0] || service.hostname || '正在解析地址…';
  }

  endpoint(service: DiscoveredService): string {
    const rawAddress = service.ipv4Addresses[0] || service.ipv6Addresses[0] || service.hostname;
    if (!rawAddress) return '';
    const address = rawAddress.includes(':') && !rawAddress.startsWith('[') ? `[${rawAddress}]` : rawAddress;
    return service.port ? `${address}:${service.port}` : address;
  }

  serviceUrl(service: DiscoveredService): string {
    const endpoint = this.endpoint(service);
    if (!endpoint) return '';
    const type = service.type.toLowerCase();
    if (!type.includes('_http') && !type.includes('_https')) return '';
    const scheme = type.includes('_https') ? 'https' : 'http';
    const path = service.txtRecord['path'] || '/';
    return `${scheme}://${endpoint}${path.startsWith('/') ? path : `/${path}`}`;
  }

  txtEntries(service: DiscoveredService): Array<{ key: string; value: string }> {
    return Object.entries(service.txtRecord || {}).map(([key, value]) => ({ key, value }));
  }

  serviceIcon(service: DiscoveredService): string {
    const type = service.type.toLowerCase();
    if (type.includes('mqtt')) return 'fa-light fa-share-nodes';
    if (type.includes('home-assistant') || type.includes('hap')) return 'fa-light fa-house-signal';
    if (type.includes('esphome')) return 'fa-light fa-microchip';
    if (type.includes('googlecast')) return 'fa-light fa-display';
    if (type.includes('airplay')) return 'fa-light fa-airplay';
    if (type.includes('http')) return 'fa-light fa-globe';
    if (this.catalogType(service)) return 'fa-light fa-folder-network';
    return 'fa-light fa-router';
  }

  typeLabel(type: string): string {
    return this.serviceTypes.find(item => item.type === this.normalizeType(type))?.label
      || type.replace(/^_/, '').replace(/\._(?:tcp|udp)\.$/i, '').toUpperCase();
  }

  catalogType(service: DiscoveredService): string {
    if (!this.isServiceCatalog) return '';
    const domain = this.normalizeDomain(service.domain || this.domain).toLowerCase();
    let candidate = service.name.trim().toLowerCase();
    if (candidate.endsWith(domain)) candidate = candidate.slice(0, -domain.length);
    candidate = this.normalizeType(candidate);
    return /^_[^.]+\._(?:tcp|udp)\.$/.test(candidate) ? candidate : '';
  }

  async discoverCatalogType(service: DiscoveredService): Promise<void> {
    const type = this.catalogType(service);
    if (!type) return;
    await this.stopScan(false);
    this.serviceType = type;
    await this.startScan();
  }

  async copyEndpoint(service: DiscoveredService): Promise<void> {
    const url = this.serviceUrl(service);
    const value = url || this.endpoint(service) || service.hostname;
    if (!value) return;
    try {
      await Clipboard.write({ string: value });
      await this.showToast('服务地址已复制');
    } catch (error) {
      await this.showToast(this.readError(error, '复制失败'));
    }
  }

  private handleWatchEvent(event: ZeroConfWatchEvent): void {
    const service = this.sanitizeService(event.service);
    const id = this.serviceId(service);

    if (event.action === 'removed') {
      this.services = this.services.filter(item => item.id !== id);
      const nextExpanded = new Set(this.expandedIds);
      nextExpanded.delete(id);
      this.expandedIds = nextExpanded;
      this.statusMessage = this.services.length
        ? `持续发现中 · ${this.services.length} 项在线`
        : `正在发现 ${this.typeLabel(this.serviceType)} 服务…`;
      this.markForCheck();
      return;
    }

    const index = this.services.findIndex(item => item.id === id);
    const previous = index >= 0 ? this.services[index] : undefined;
    const incoming: DiscoveredService = {
      ...service,
      hostname: service.hostname || previous?.hostname || '',
      port: service.port || previous?.port || 0,
      ipv4Addresses: service.ipv4Addresses.length ? service.ipv4Addresses : previous?.ipv4Addresses || [],
      ipv6Addresses: service.ipv6Addresses.length ? service.ipv6Addresses : previous?.ipv6Addresses || [],
      txtRecord: Object.keys(service.txtRecord).length ? service.txtRecord : previous?.txtRecord || {},
      id,
      resolved: event.action === 'resolved' || previous?.resolved || false,
      lastSeen: Date.now(),
    };
    const next = [...this.services];
    if (index >= 0) next[index] = incoming;
    else next.push(incoming);
    this.services = next;
    this.statusMessage = `持续发现中 · ${this.services.length} 项在线`;
    this.markForCheck();
  }

  private sanitizeService(service: ZeroConfServiceData): ZeroConfServiceData {
    return {
      domain: service.domain || this.domain,
      type: service.type || this.activeRequest?.type || this.serviceType,
      name: service.name || '未命名服务',
      port: Number(service.port) || 0,
      hostname: service.hostname || '',
      ipv4Addresses: service.ipv4Addresses || [],
      ipv6Addresses: service.ipv6Addresses || [],
      txtRecord: service.txtRecord || {},
    };
  }

  private serviceId(service: ZeroConfServiceData): string {
    return `${service.name}|${service.type}|${service.domain}`.toLowerCase();
  }

  private searchableText(service: DiscoveredService): string {
    return [
      service.name,
      service.type,
      service.hostname,
      ...service.ipv4Addresses,
      ...service.ipv6Addresses,
      ...Object.entries(service.txtRecord).flat(),
    ].join(' ').toLowerCase();
  }

  private normalizeType(value: string, strict = false): string {
    let type = value.trim().toLowerCase();
    if (type && !type.startsWith('_')) type = `_${type}`;
    if (type && !type.endsWith('.')) type += '.';
    const isServiceCatalog = type === '_services._dns-sd._udp.';
    if (strict && !isServiceCatalog && !/^_[a-z0-9][a-z0-9-]{0,62}\._(?:tcp|udp)\.$/.test(type)) {
      throw new Error('服务类型格式应为 _名称._tcp. 或 _名称._udp.');
    }
    return type;
  }

  private normalizeDomain(value: string): string {
    const domain = value.trim().toLowerCase() || 'local.';
    return domain.endsWith('.') ? domain : `${domain}.`;
  }

  private startElapsedTimer(): void {
    this.clearElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      this.scanElapsed = Math.floor((Date.now() - this.scanStartedAt) / 1000);
      this.markForCheck();
    }, 1000);
  }

  private clearElapsedTimer(): void {
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
  }

  private async refreshNetworkStatus(): Promise<void> {
    try {
      this.networkStatus = await Network.getStatus();
    } catch {
      this.networkStatus = { connected: navigator.onLine, connectionType: 'unknown' };
    }
  }

  private async releaseResources(): Promise<void> {
    await this.stopScan(false);
    await this.networkListener?.remove();
    this.networkListener = undefined;
  }

  private readError(error: unknown, fallback = '操作失败，请稍后重试'): string {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    if (/not available on this platform/i.test(message)) return '当前平台不支持 mDNS 发现，请在手机 App 中使用';
    if (/permission|denied/i.test(message)) return '缺少局域网访问权限，请在系统设置中授权后重试';
    return message || fallback;
  }

  private markForCheck(): void {
    if (!this.destroyed) this.cdr.markForCheck();
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2200, position: 'bottom' });
    await toast.present();
  }
}
