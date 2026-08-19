import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { sha256 } from '../functions/func';
import {
  AilyResponse,
  BlinkerResponse,
  CurrentUser,
  DeletedAccountResponse,
  DeviceConfigResponse,
  DeviceDataResponse,
  DeviceListResponse,
  DeviceResponse,
  DeviceStatusResponse,
  GatewayDevice,
  GatewayHttpError,
} from '../model/response.model';
import { DataService, GatewayDeviceHydration } from './data.service';
import { NoticeService } from './notice.service';

interface SessionFence {
  epoch: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  get avatarUploadConfigured(): boolean {
    return API.USER.UPLOAD_AVATAR.trim().length > 0;
  }

  get uuid() {
    return this.dataService.auth?.uuid ?? null;
  }

  get token() {
    return this.dataService.auth?.token ?? null;
  }

  constructor(
    private http: HttpClient,
    private dataService: DataService,
    private noticeService: NoticeService,
  ) {}

  async getAllInfo(): Promise<boolean> {
    const session = this.captureSession();
    if (!session) return false;
    this.dataService.userLoadError.next(null);
    this.dataService.deviceLoadError.next(null);
    this.dataService.configLoadError.next(null);

    const [userResult, deviceResult] = await Promise.allSettled([
      firstValueFrom(this.http.get<AilyResponse<CurrentUser>>(API.AUTH.ME)),
      firstValueFrom(this.http.get<DeviceListResponse>(API.DEVICE.LIST)),
    ]);
    if (!this.sessionMatches(session)) return false;

    const deletedAccountError =
      userResult.status === 'rejected' &&
      this.isServiceAccountDeletedError(userResult.reason)
        ? userResult.reason
        : deviceResult.status === 'rejected' &&
            this.isServiceAccountDeletedError(deviceResult.reason)
          ? deviceResult.reason
          : null;
    if (deletedAccountError) {
      this.dataService.userLoadError.next(deletedAccountError);
      await this.noticeService.hideLoading();
      return false;
    }

    if (userResult.status === 'rejected' || !userResult.value?.data?.id) {
      this.dataService.userLoadError.next(
        userResult.status === 'rejected'
          ? userResult.reason
          : new Error('The current-user response is incomplete.'),
      );
      await this.noticeService.hideLoading();
      return false;
    }

    let devices: GatewayDevice[];
    if (deviceResult.status === 'fulfilled' && Array.isArray(deviceResult.value?.devices)) {
      devices = deviceResult.value.devices;
    } else {
      this.dataService.deviceLoadError.next(
        deviceResult.status === 'rejected'
          ? deviceResult.reason
          : new Error('The device-list response is invalid.'),
      );
      this.dataService.loadGatewayUser(userResult.value.data);
      this.dataService.initCompleted.next(true);
      await this.noticeService.hideLoading();
      return true;
    }

    let hydration: GatewayDeviceHydration;
    try {
      hydration = await this.loadDeviceHydration(devices);
    } catch (error) {
      if (!this.sessionMatches(session)) return false;
      if (this.isServiceAccountDeletedError(error)) {
        this.dataService.userLoadError.next(error);
      } else {
        this.dataService.deviceLoadError.next(error);
      }
      await this.noticeService.hideLoading();
      return false;
    }
    if (!this.sessionMatches(session)) return false;
    this.dataService.loadGatewayData(userResult.value.data, devices, hydration);
    await this.noticeService.hideLoading();
    return true;
  }

  getUserInfo(): Promise<boolean> {
    return this.getAllInfo();
  }

  getDeviceInfo(): Promise<boolean> {
    return this.getAllInfo();
  }

  saveUserConfig(userConfig): Promise<boolean> {
    return firstValueFrom(
      this.http.post<BlinkerResponse>(API.USER.SAVE_CONFIG, {
        uuid: this.uuid,
        token: this.token,
        userConf: JSON.stringify(userConfig),
      }),
    )
      .then((response) => response.message === 1000)
      .catch(this.handleError);
  }

  async delDevice(device: { id?: string; deviceId?: string; deviceName?: string }): Promise<boolean> {
    const deviceId = device?.deviceId || device?.id || device?.deviceName;
    if (!deviceId) return false;
    try {
      await firstValueFrom(
        this.http.delete<DeviceResponse>(API.DEVICE.DETAIL(deviceId)),
      );
      return true;
    } catch {
      return false;
    }
  }

  unbindDevice(device): void {
    void this.delDevice(device);
  }

  bindDevice(_device): Promise<boolean> {
    return this.getDeviceInfo();
  }

  changePassword(oldPassword, newPassword): Promise<boolean> {
    return firstValueFrom(
      this.http.get<BlinkerResponse>(API.USER.CHANGE_PASSWORD, {
        params: {
          uuid: this.uuid,
          token: this.token,
          oldPassword: sha256(oldPassword),
          newPassword: sha256(newPassword),
        },
      }),
    )
      .then((response) => response.message === 1000)
      .catch(this.handleError);
  }

  changeProfile(Newusername): Promise<any> {
    return firstValueFrom(
      this.http.get<BlinkerResponse>(API.USER.CHANGE_PROFILE, {
        params: {
          uuid: this.uuid,
          token: this.token,
          username: Newusername,
        },
      }),
    )
      .then((response) => response.message === 1000)
      .catch(this.handleError);
  }

  uploadAvatar(newAvatar: Blob): Promise<boolean> {
    if (!this.avatarUploadConfigured) return Promise.resolve(false);

    const formData = new FormData();
    const filename = newAvatar instanceof File ? newAvatar.name : 'avatar.webp';
    formData.append('file', newAvatar, filename);
    formData.append('uuid', this.uuid);
    formData.append('token', this.token);
    return firstValueFrom(
      this.http.post<BlinkerResponse>(API.USER.UPLOAD_AVATAR, formData),
    )
      .then((response) => response.message === 1000)
      .catch(this.handleError);
  }

  async cancelBlinkerAccount(): Promise<boolean> {
    const session = this.captureSession();
    return session ? this.deleteBlinkerAccount(session) : false;
  }

  cancelAccount(password): Promise<boolean> {
    return firstValueFrom(
      this.http.get<BlinkerResponse>(API.USER.CANCEL_ACCOUNT, {
        params: {
          uuid: this.uuid,
          token: this.token,
          password: sha256(password),
        },
      }),
    )
      .then((response) => response.message === 1000)
      .catch(this.handleError);
  }

  handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }

  private async deleteBlinkerAccount(session: SessionFence): Promise<boolean> {
    const retryDelays = [250, 750];
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      if (!this.sessionMatches(session)) return false;
      try {
        const response = await firstValueFrom(
          this.http.delete<DeletedAccountResponse>(API.ACCOUNT.ROOT),
        );
        if (!this.sessionMatches(session)) return false;
        if (response?.account?.status !== 'deleted') return false;
        this.dataService.authDataExpire.next(true);
        this.dataService.clearBlinkerData();
        return true;
      } catch (error) {
        if (!this.sessionMatches(session)) return false;
        const retryable = this.isRetryableDeletionError(error);
        if (!retryable || attempt >= retryDelays.length) return false;
        await this.delay(retryDelays[attempt]);
      }
    }
    return false;
  }

  private captureSession(): SessionFence | null {
    const auth = this.dataService.auth;
    return auth
      ? { epoch: this.dataService.sessionEpoch }
      : null;
  }

  private sessionMatches(session: SessionFence): boolean {
    const auth = this.dataService.auth;
    return !!auth && this.dataService.sessionEpoch === session.epoch;
  }

  private isServiceAccountDeletedError(error: unknown): boolean {
    if (error instanceof GatewayHttpError) {
      return (
        error.httpStatus === 410 && error.code === 'SERVICE_ACCOUNT_DELETED'
      );
    }
    if (!(error instanceof HttpErrorResponse)) return false;
    const body = error.error as
      | { code?: unknown; errorCode?: unknown }
      | null
      | undefined;
    return (
      error.status === 410 &&
      (body?.errorCode === 'SERVICE_ACCOUNT_DELETED' ||
        body?.code === 'SERVICE_ACCOUNT_DELETED')
    );
  }

  private isRetryableDeletionError(error: unknown): boolean {
    const status =
      error instanceof GatewayHttpError
        ? error.httpStatus
        : error instanceof HttpErrorResponse
          ? error.status
          : 0;
    return status === 0 || status === 409 || status >= 500;
  }

  private async loadDeviceHydration(
    devices: GatewayDevice[],
  ): Promise<GatewayDeviceHydration> {
    const hydration: GatewayDeviceHydration = {
      configs: {},
      statuses: {},
      snapshots: {},
    };

    await Promise.all(
      devices.map(async (device) => {
        const id = device.deviceId;
        const [config, status, snapshot] = await Promise.allSettled([
          firstValueFrom(
            this.http.get<DeviceConfigResponse>(API.DEVICE.CONFIG(id)),
          ),
          firstValueFrom(
            this.http.get<DeviceStatusResponse>(API.DEVICE.STATUS(id)),
          ),
          firstValueFrom(
            this.http.get<DeviceDataResponse>(API.DEVICE.DATA(id)),
          ),
        ]);
        for (const result of [config, status, snapshot]) {
          if (
            result.status === 'rejected' &&
            this.isServiceAccountDeletedError(result.reason)
          ) {
            throw result.reason;
          }
        }

        if (
          config.status === 'fulfilled' &&
          config.value &&
          config.value.config !== null &&
          typeof config.value.config === 'object' &&
          !Array.isArray(config.value.config)
        ) {
          hydration.configs[id] = config.value;
        } else {
          this.dataService.configLoadError.next(
            config.status === 'rejected'
              ? config.reason
              : new Error('The device-config response is invalid.'),
          );
        }
        if (status.status === 'fulfilled') {
          hydration.statuses[id] = status.value;
        } else {
          this.dataService.deviceLoadError.next(status.reason);
        }
        if (snapshot.status === 'fulfilled') {
          hydration.snapshots[id] = snapshot.value;
        } else {
          this.dataService.deviceLoadError.next(snapshot.reason);
        }
      }),
    );
    return hydration;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
