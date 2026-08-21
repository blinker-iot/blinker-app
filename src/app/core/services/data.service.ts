import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthData, OrderData, ShareDate, UserData } from '../model/data.model';
import { BlinkerDevice } from '../model/device.model';
import {
  CurrentUser,
  DeviceConfigResponse,
  DeviceDataResponse,
  DeviceStatusResponse,
  GatewayDevice,
} from '../model/response.model';
import { createGuestDevicePreview } from '../data/guest-device-preview.data';

const AUTH_STORAGE_KEY = 'session';
export const AUTH_INVALIDATED_STORAGE_KEY = 'blinker-auth-invalidated';
const INSTALLATION_ID_KEY = 'blinker-installation-id';
const FEEDBACK_DRAFT_STORAGE_KEY = 'blinker_feedback_draft';

export interface GatewayDeviceHydration {
  configs?: Record<string, DeviceConfigResponse | undefined>;
  statuses?: Record<string, DeviceStatusResponse | undefined>;
  snapshots?: Record<string, DeviceDataResponse | undefined>;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  readonly authDataLoader = new BehaviorSubject(false);
  readonly userDataLoader = new BehaviorSubject(false);
  readonly deviceDataLoader = new BehaviorSubject(false);
  readonly initCompleted = new BehaviorSubject(false);
  readonly authCheck = new Subject<boolean>();
  readonly authDataExpire = new Subject<boolean>();
  readonly authDataChanged = new Subject<void>();
  readonly userLoadError = new BehaviorSubject<unknown>(null);
  readonly deviceLoadError = new BehaviorSubject<unknown>(null);
  readonly configLoadError = new BehaviorSubject<unknown>(null);
  readonly authStorageCleanupError = new BehaviorSubject<unknown>(null);

  firstBoot = true;

  private _auth: AuthData | null = null;
  private _sessionEpoch = 0;
  private secureStorageReady: Promise<void> | null = null;

  user: UserData = this.emptyUser();
  device: OrderData = this.emptyOrder();
  scene: OrderData = this.emptyOrder();
  room: OrderData = this.emptyOrder();
  auto: OrderData = this.emptyOrder();
  block: OrderData = this.emptyOrder();
  share: ShareDate = this.emptyShare();
  brokers: OrderData = this.emptyOrder();
  tempImgFile: unknown;

  set auth(auth: AuthData | null) {
    this._sessionEpoch += 1;
    this._auth = auth
      ? { ...auth, token: auth.token || auth.accessToken }
      : null;
    this.authDataLoader.next(!!auth);
    this.authDataChanged.next();
    if (this._auth) void this.persistAuthData(this._auth);
  }

  get auth(): AuthData | null {
    return this._auth;
  }

  get sessionEpoch(): number {
    return this._sessionEpoch;
  }

  async init(): Promise<void> {
    this.removeLegacyAuthData();
    await this.loadAuthData();
  }

  async setAuthData(auth: AuthData): Promise<boolean> {
    if (!this.isValidAuth(auth)) {
      throw new Error('The Gateway did not return a complete token pair.');
    }
    const previous = this._auth ? { ...this._auth } : null;
    this._sessionEpoch += 1;
    const next = { ...auth, token: auth.token || auth.accessToken };
    this._auth = next;
    this.authDataLoader.next(true);
    this.authDataChanged.next();
    try {
      await this.persistAuthData(next);
      if (!this.authMatches(next)) {
        await this.persistCurrentAuth();
        return false;
      }
      this.authDataExpire.next(true);
      this.resetBlinkerMemory();
      try {
        this.getLocalStorage()?.removeItem(FEEDBACK_DRAFT_STORAGE_KEY);
        this.getLocalStorage()?.removeItem(AUTH_INVALIDATED_STORAGE_KEY);
      } catch {
        // Authentication still succeeds when local storage is unavailable.
      }
      return true;
    } catch (error) {
      if (this.authMatches(next)) {
        this._auth = previous;
        this.authDataLoader.next(!!previous);
        this.authDataChanged.next();
      }
      throw error;
    }
  }

  async replaceAuthData(
    expected: Pick<AuthData, 'accessToken' | 'refreshToken'>,
    auth: AuthData,
  ): Promise<boolean> {
    if (!this.isValidAuth(auth)) {
      throw new Error('The Gateway did not return a complete token pair.');
    }
    if (!this.authMatches(expected)) return false;

    const previous = this._auth ? { ...this._auth } : null;
    const next = {
      ...auth,
      ...(previous?.uuid ? { uuid: previous.uuid } : {}),
      token: auth.token || auth.accessToken,
    };
    this._auth = next;
    this.authDataLoader.next(true);
    this.authDataChanged.next();
    try {
      await this.persistAuthData(next);
      if (!this.authMatches(next)) {
        await this.persistCurrentAuth();
        return false;
      }
      return true;
    } catch (error) {
      if (this.authMatches(next)) {
        this._auth = previous;
        this.authDataLoader.next(!!previous);
        this.authDataChanged.next();
      }
      throw error;
    }
  }

  async loadAuthData(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (this.authIsInvalidated()) {
      const cleanupError = await this.clearPersistedAuthData();
      this._auth = null;
      this.authDataLoader.next(false);
      this.authDataChanged.next();
      this.authStorageCleanupError.next(cleanupError);
      return;
    }
    try {
      await this.configureSecureStorage();
      const saved = await SecureStorage.get(AUTH_STORAGE_KEY);
      if (this.isValidAuth(saved)) {
        this._sessionEpoch += 1;
        this._auth = {
          accessToken: saved.accessToken,
          refreshToken: saved.refreshToken,
          tokenType: saved.tokenType,
          ...(this.nonEmptyString(saved.uuid) ? { uuid: saved.uuid } : {}),
          token: this.nonEmptyString(saved.token)
            ? saved.token
            : saved.accessToken,
        };
        this.authDataLoader.next(true);
        this.authDataChanged.next();
      } else if (saved !== null) {
        await SecureStorage.remove(AUTH_STORAGE_KEY);
      }
    } catch {
      this._sessionEpoch += 1;
      this._auth = null;
      this.authDataLoader.next(false);
      this.authDataChanged.next();
    }
  }

  async removeAuthData(): Promise<void> {
    this._sessionEpoch += 1;
    this._auth = null;
    this.authDataLoader.next(false);
    this.authDataChanged.next();
    this.clearBlinkerData();
    let cleanupError = this.markAuthInvalidated();
    cleanupError = (await this.clearPersistedAuthData()) || cleanupError;
    if (this._auth) {
      try {
        await this.persistCurrentAuth();
      } catch (error) {
        cleanupError = error;
      }
    }
    this.authStorageCleanupError.next(cleanupError);
  }

  clearBlinkerData(): void {
    try {
      const storage = this.getLocalStorage();
      storage?.removeItem(FEEDBACK_DRAFT_STORAGE_KEY);
    } catch {
      // Memory cleanup still proceeds when local storage is unavailable.
    }
    this.resetBlinkerMemory();
  }

  private resetBlinkerMemory(): void {
    this.user = this.emptyUser();
    this.device = this.emptyOrder();
    this.scene = this.emptyOrder();
    this.room = this.emptyOrder();
    this.auto = this.emptyOrder();
    this.block = this.emptyOrder();
    this.share = this.emptyShare();
    this.brokers = this.emptyOrder();
    this.userDataLoader.next(false);
    this.deviceDataLoader.next(false);
    this.initCompleted.next(false);
    this.firstBoot = true;
  }

  getInstallationId(): string {
    const storage = this.getLocalStorage();
    const saved = storage?.getItem(INSTALLATION_ID_KEY);
    if (saved) return saved;

    const generated = this.createInstallationId();
    storage?.setItem(INSTALLATION_ID_KEY, generated);
    return generated;
  }

  loadGuestDevicePreview(force = false): void {
    if (!force && this.auth) return;
    const preview = createGuestDevicePreview();
    this.device = preview.device;
    this.room = preview.room;
  }

  loadGatewayData(
    currentUser: CurrentUser,
    devices: GatewayDevice[],
    hydration: GatewayDeviceHydration = {},
  ): void {
    this.loadGatewayUser(currentUser);
    const previousDevices = this.device?.dict || {};
    const deviceDict: Record<string, BlinkerDevice> = {};

    for (const gatewayDevice of devices || []) {
      const id = gatewayDevice.deviceId;
      if (!id) continue;

      const hydratedConfig = hydration.configs?.[id]?.config;
      const hasHydratedConfig =
        Object.prototype.hasOwnProperty.call(hydration.configs || {}, id) &&
        this.isRecord(hydratedConfig);
      const previousConfig = this.isRecord(previousDevices[id]?.config)
        ? previousDevices[id].config
        : {};
      const rawConfig = hasHydratedConfig ? hydratedConfig : previousConfig;
      const safeConfig = { ...rawConfig };
      delete safeConfig['authKey'];
      delete safeConfig['auth_key'];

      const hasHydratedStatus = Object.prototype.hasOwnProperty.call(
        hydration.statuses || {},
        id,
      );
      const status = hydration.statuses?.[id]?.status;
      const snapshot = hydration.snapshots?.[id]?.data;
      const previousData = this.isRecord(previousDevices[id]?.data)
        ? previousDevices[id].data
        : {};
      const snapshotData = this.isRecord(snapshot?.data) ? snapshot.data : {};
      const data: Record<string, unknown> = {
        switch: '',
        ...previousData,
        ...snapshotData,
      };
      if (hasHydratedStatus) {
        const online = status?.mqttOnline === true;
        data['state'] = online ? 'online' : 'offline';
        data['enable'] = online;
      }

      const customName = this.nonEmptyString(safeConfig['customName']) ||
        this.nonEmptyString(safeConfig['displayName']) || gatewayDevice.name || id;
      const config = {
        ...safeConfig,
        customName,
        image: this.nonEmptyString(safeConfig['image']) || 'diyarduino.png',
        broker: this.nonEmptyString(safeConfig['broker']) || 'blinker',
        mode: this.nonEmptyString(safeConfig['mode']) || 'mqtt',
        disabled: typeof safeConfig['disabled'] === 'boolean'
          ? safeConfig['disabled']
          : gatewayDevice.status !== 'active',
        layouter: this.normalizeLayouterConfig(safeConfig['layouter']),
      } as BlinkerDevice['config'];

      deviceDict[id] = {
        ...gatewayDevice,
        id,
        deviceName: id,
        deviceType: gatewayDevice.deviceType,
        config,
        data,
        storage: previousDevices[id]?.storage || {},
        subject: previousDevices[id]?.subject || new Subject<unknown>(),
      } as BlinkerDevice;
    }

    const previousDeviceList = Array.isArray(this.device?.list)
      ? this.device.list.filter(
          (deviceId, index, list) =>
            !!deviceDict[deviceId] && list.indexOf(deviceId) === index,
        )
      : [];
    const deviceList = [
      ...previousDeviceList,
      ...Object.keys(deviceDict).filter(
        (deviceId) => !previousDeviceList.includes(deviceId),
      ),
    ];
    this.device = { dict: deviceDict, list: deviceList };
    this.deviceDataLoader.next(true);
    if (this.firstBoot) {
      this.initCompleted.next(true);
      this.firstBoot = false;
    }
  }

  loadGatewayUser(currentUser: CurrentUser): void {
    if (this._auth) {
      this._auth = {
        ...this._auth,
        uuid: currentUser.id,
        token: this._auth.accessToken,
      };
    }
    this.user = {
      id: currentUser.id,
      nickname: currentUser.nickname,
      email: currentUser.email,
      username: currentUser.nickname?.trim() || currentUser.email,
      avatar: currentUser.avatar ?? '',
      phone: currentUser.phone ?? '',
      subscriptionPlan: currentUser.subscription_plan,
      permissions: currentUser.permissions,
      rbacPermissions: currentUser.rbac_permissions,
      entitlementRevision: currentUser.entitlement_revision,
      entitlements: currentUser.entitlements,
    };
    this.userDataLoader.next(true);
  }

  getDevice(id: string): BlinkerDevice | undefined {
    return this.device?.dict?.[id];
  }

  checkInvalidDevice(deviceList: string[] | undefined): string[] {
    return (deviceList || []).filter((deviceId) => !!this.device?.dict?.[deviceId]);
  }

  checkDeviceList(): void {
    for (const deviceId of Object.keys(this.device?.dict || {})) {
      if (!this.device.list.includes(deviceId)) this.device.list.push(deviceId);
    }
  }

  updateAvatarCache(): void {
    if (!this.user?.avatar) return;
    this.user.avatar = this.user.avatar.split('?')[0] + '?date=' + Date.now();
  }

  private async persistAuthData(auth: AuthData): Promise<void> {
    this.removeLegacyAuthData();
    if (!Capacitor.isNativePlatform()) return;
    await this.configureSecureStorage();
    await SecureStorage.set(
      AUTH_STORAGE_KEY,
      auth as unknown as Record<string, unknown>,
    );
  }

  private async persistCurrentAuth(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const current = this._auth;
    if (current) {
      await this.persistAuthData(current);
      return;
    }
    await this.configureSecureStorage();
    await SecureStorage.remove(AUTH_STORAGE_KEY);
  }

  private async clearPersistedAuthData(): Promise<unknown | null> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      await this.configureSecureStorage();
    } catch (error) {
      return error;
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await SecureStorage.remove(AUTH_STORAGE_KEY);
        return null;
      } catch (error) {
        lastError = error;
      }
    }

    try {
      await SecureStorage.set(AUTH_STORAGE_KEY, { invalidated: true });
    } catch (error) {
      return error;
    }
    try {
      await SecureStorage.remove(AUTH_STORAGE_KEY);
      return null;
    } catch (error) {
      return error || lastError;
    }
  }

  private authIsInvalidated(): boolean {
    try {
      return this.getLocalStorage()?.getItem(AUTH_INVALIDATED_STORAGE_KEY) === '1';
    } catch {
      return true;
    }
  }

  private markAuthInvalidated(): unknown | null {
    try {
      const storage = this.getLocalStorage();
      if (!storage) return new Error('Persistent invalidation storage is unavailable.');
      storage.setItem(AUTH_INVALIDATED_STORAGE_KEY, '1');
      return null;
    } catch (error) {
      return error;
    }
  }

  private configureSecureStorage(): Promise<void> {
    if (!this.secureStorageReady) {
      this.secureStorageReady = SecureStorage.setKeyPrefix('blinker_');
    }
    return this.secureStorageReady;
  }

  private removeLegacyAuthData(): void {
    try {
      this.getLocalStorage()?.removeItem('auth');
    } catch {
      // Storage can be unavailable in privacy modes. Tokens remain in memory.
    }
  }

  private isValidAuth(value: unknown): value is AuthData {
    if (!this.isRecord(value)) return false;
    return this.nonEmptyString(value['accessToken']) !== '' &&
      this.nonEmptyString(value['refreshToken']) !== '' &&
      this.nonEmptyString(value['tokenType']) !== '';
  }

  private authMatches(
    value: Pick<AuthData, 'accessToken' | 'refreshToken'>,
  ): boolean {
    return this._auth?.accessToken === value.accessToken &&
      this._auth.refreshToken === value.refreshToken;
  }

  private createInstallationId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
      hex.slice(10).join('');
  }

  private getLocalStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private nonEmptyString(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  private normalizeLayouterConfig(value: unknown): string {
    if (typeof value === 'string') return value;
    if (this.isRecord(value)) return JSON.stringify(value);
    return '';
  }

  private emptyOrder(): OrderData {
    return { dict: {}, list: [] };
  }

  private emptyShare(): ShareDate {
    return { share: {}, share0: {}, shared: [], shared0: [] };
  }

  private emptyUser(): UserData {
    return { username: '', avatar: '', phone: '' };
  }
}
