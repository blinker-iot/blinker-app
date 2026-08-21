import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { sha256 } from '../functions/func';
import { BlinkerDevice } from '../model/device.model';
import {
  AccountDeletionCodeData,
  AilyResponse,
  BlinkerResponse,
  CurrentUser,
  DeletedAccountResponse,
  DeviceKeyListResponse,
  DeviceKeyLogicalDevice,
  DeviceV2ReceivedDevice,
  DeviceV2ReceivedSharesResponse,
  GatewayHttpError,
} from '../model/response.model';
import { DataService } from './data.service';
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

    const [userResult, deviceResult, receivedResult] = await Promise.allSettled([
      firstValueFrom(this.http.get<AilyResponse<CurrentUser>>(API.AUTH.ME)),
      firstValueFrom(this.http.get<DeviceKeyListResponse>(API.DEVICE_V2.LIST)),
      firstValueFrom(this.http.get<DeviceV2ReceivedSharesResponse>(
        API.DEVICE_V2.RECEIVED_SHARES,
      )),
    ]);
    if (!this.sessionMatches(session)) return false;

    const deletedAccountError =
      userResult.status === 'rejected' &&
      this.isServiceAccountDeletedError(userResult.reason)
        ? userResult.reason
        : deviceResult.status === 'rejected' &&
            this.isServiceAccountDeletedError(deviceResult.reason)
          ? deviceResult.reason
          : receivedResult.status === 'rejected' &&
              this.isServiceAccountDeletedError(receivedResult.reason)
            ? receivedResult.reason
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

    let devices: DeviceKeyLogicalDevice[];
    if (
      deviceResult.status === 'fulfilled'
      && Array.isArray(deviceResult.value?.data?.devices)
    ) {
      devices = deviceResult.value.data.devices;
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

    let received: DeviceV2ReceivedDevice[] = [];
    if (receivedResult.status === 'fulfilled'
      && Array.isArray(receivedResult.value?.data?.devices)) {
      received = receivedResult.value.data.devices;
    } else {
      this.dataService.configLoadError.next(
        receivedResult.status === 'rejected'
          ? receivedResult.reason
          : new Error('The received-share response is invalid.'),
      );
    }

    if (!this.sessionMatches(session)) return false;
    this.dataService.loadGatewayData(userResult.value.data, devices, received);
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

  delDevice(device: BlinkerDevice): Promise<boolean> {
    return firstValueFrom(
      this.http.get<BlinkerResponse>(API.USER.DEL_DEVICE, {
        params: {
          uuid: this.uuid,
          token: this.token,
          deviceName: device.deviceName,
        },
      }),
    )
      .then((response) => response.message === 1000)
      .catch(this.handleError);
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

  async cancelBlinkerAccount(code: string): Promise<DeletedAccountResponse> {
    const session = this.requireSession();
    if (!/^D-\d{6}$/.test(code)) {
      throw new GatewayHttpError({
        httpStatus: 400,
        code: 'ACCOUNT_DELETION_CODE_INVALID',
        message: 'The account-deletion code format is invalid.',
      });
    }
    const response = await firstValueFrom(
      this.http.delete<DeletedAccountResponse>(API.ACCOUNT.ROOT, {
        body: { code },
        observe: 'response',
      }),
    );
    this.assertSessionMatches(session);
    if (
      response.status !== 200
      || response.body?.account?.status !== 'deleted'
    ) {
      throw this.invalidAccountDeletionResponse();
    }
    return response.body;
  }

  async requestAccountDeletionCode(): Promise<AccountDeletionCodeData> {
    const session = this.requireSession();
    const response = await firstValueFrom(
      this.http.post<AilyResponse<AccountDeletionCodeData>>(
        API.ACCOUNT.DELETION_CODE,
        {},
        { observe: 'response' },
      ),
    );
    this.assertSessionMatches(session);
    const body = response.body;
    const data = body?.data;
    if (
      response.status !== 200
      || body?.status !== 200
      || data?.purpose !== 'account_deletion'
      || !Number.isFinite(data.expiresIn)
      || data.expiresIn <= 0
      || !data.maskedEmail?.trim()
    ) {
      throw this.invalidAccountDeletionResponse();
    }
    return data;
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

  private requireSession(): SessionFence {
    const session = this.captureSession();
    if (!session) {
      throw new GatewayHttpError({
        httpStatus: 401,
        code: 'AUTH_TOKEN_MISSING',
        message: 'An authenticated session is required.',
      });
    }
    return session;
  }

  private assertSessionMatches(session: SessionFence): void {
    if (this.sessionMatches(session)) return;
    throw new GatewayHttpError({
      httpStatus: 401,
      code: 'AUTH_SESSION_CHANGED',
      message: 'The authenticated session changed during the request.',
    });
  }

  private invalidAccountDeletionResponse(): GatewayHttpError {
    return new GatewayHttpError({
      httpStatus: 502,
      code: 'ACCOUNT_DELETION_RESPONSE_INVALID',
      message: 'The account-deletion response is invalid.',
    });
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

}
