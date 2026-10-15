import { Inject, Injectable } from '@angular/core';
import { DEVICE_CONSOLE_API_BASE, DeviceConsoleHost, PublicConsoleBookmark } from '../device-v2/console-host';
import { NavController } from '@ionic/angular/standalone';
import { Clipboard } from '@capacitor/clipboard';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { getServiceRegion } from '../../configs/service-region.config';
import { DataService } from './data.service';
import { UserService } from './user.service';
import { AppVisibilityService } from './app-visibility.service';

@Injectable({ providedIn: 'root' })
export class AppDeviceConsoleHost implements DeviceConsoleHost {
  constructor(
    private readonly data: DataService,
    private readonly users: UserService,
    private readonly nav: NavController,
    private readonly visibility: AppVisibilityService,
    @Inject(DEVICE_CONSOLE_API_BASE) private readonly apiBase: string
  ) {}

  get activeChanges(): Observable<boolean> {
    return this.visibility.active;
  }

  get authenticated(): boolean {
    return !!this.data.auth?.accessToken;
  }

  get sessionVersion(): number {
    return this.data.sessionEpoch;
  }

  get sessionChanges(): Observable<unknown> {
    return this.data.authDataChanged;
  }

  get homeHref(): string {
    return '/share-manager';
  }

  get consoleWebBaseUrl(): string {
    return environment.consoleWebBaseUrl;
  }

  async requestLogin(token: string, region = getServiceRegion()): Promise<void> {
    await this.nav.navigateForward('/login', { queryParams: { returnConsole: token, returnConsoleRegion: region } });
  }

  async openDevice(deviceId: string, sessionVersion: number): Promise<boolean> {
    if (!this.data.device?.dict?.[deviceId]) await this.users.getAllInfo();
    if (this.sessionVersion !== sessionVersion) return false;

    const device = this.data.device?.dict?.[deviceId];

    if (!device) return false;

    // Replace the link resolver while preserving the page that opened it.
    await this.nav.navigateForward(`/device/${encodeURIComponent(deviceId)}`, { replaceUrl: true });

    return true;
  }

  private get publicDevicesKey(): string {
    return `blinker-public-consoles:v1:${this.apiBase}`;
  }

  async readPublicDevices(): Promise<unknown> {
    const saved = localStorage.getItem(this.publicDevicesKey);

    if (!saved) return [];
    if (saved.length > 128 * 1024) throw new Error('本机设备列表过大');

    return JSON.parse(saved);
  }

  async writePublicDevices(devices: readonly PublicConsoleBookmark[]): Promise<void> {
    localStorage.setItem(this.publicDevicesKey, JSON.stringify(devices));
  }

  async copyText(text: string): Promise<void> {
    await Clipboard.write({ string: text });
  }
}
