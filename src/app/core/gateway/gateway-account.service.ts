import { Injectable } from '@angular/core';
import { DataService } from '../services/data.service';
import { GatewayAuthApiService } from './auth-api.service';
import { mapGatewayUser } from './gateway-user.adapter';
import { GatewaySessionService } from './gateway-session.service';
import { ManagedDeviceService } from './managed-device.service';

@Injectable({ providedIn: 'root' })
export class GatewayAccountService {
  constructor(
    private readonly authApi: GatewayAuthApiService,
    private readonly session: GatewaySessionService,
    private readonly devices: ManagedDeviceService,
    private readonly dataService: DataService,
  ) {}

  get isLoggedIn(): boolean {
    return this.session.hasSession;
  }

  async sendEmailCode(email: string): Promise<void> {
    await this.authApi.sendEmailCode(email.trim());
  }

  async login(email: string, code: string): Promise<void> {
    const profile = await this.authApi.login(email.trim(), code.trim());
    try {
      this.dataService.user = mapGatewayUser(profile);
      await this.devices.loadAll();
    } catch (error) {
      this.session.clear();
      this.devices.clearLocal();
      this.dataService.user = undefined;
      throw error;
    }
  }

  async loadAll(): Promise<void> {
    const profile = await this.authApi.getCurrentUser();
    this.dataService.user = mapGatewayUser(profile);
    await this.devices.loadAll();
  }

  async logout(): Promise<void> {
    try {
      await this.authApi.logout();
    } finally {
      this.devices.clearLocal();
      this.dataService.user = undefined;
      this.dataService.userDataLoader.next(false);
      this.dataService.initCompleted.next(false);
      this.dataService.firstBoot = true;
    }
  }
}
