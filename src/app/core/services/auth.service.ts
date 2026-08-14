import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { Wechat } from 'capacitor-wechat';
import { API } from 'src/app/configs/api.config';
import { AltchaChallenge, solveAltcha } from '../functions/altcha-solver';
import { gatewayContext } from '../injectable/gateway.context';
import { GatewayError } from '../model/gateway-error.model';
import {
    AilyEnvelope,
    GatewayTokenResponse,
    GatewayUserProfile,
} from '../model/gateway.model';
import { mapGatewayUser } from '../functions/gateway-user.adapter';
import { sha256 } from '../functions/func';
import { BlinkerResponse } from '../model/response.model';
import { AuthSessionService } from './auth-session.service';
import { DataService } from './data.service';
import { ManagedDeviceService } from './managed-device.service';


@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private sendingEmailCode = false;
    private loggingInWithEmailCode = false;

    get uuid() {
        return this.dataService.auth?.uuid
    }

    get token() {
        return this.dataService.auth?.token
    }

    get hasGatewaySession(): boolean {
        return this.authSession.hasSession;
    }

    constructor(
        private http: HttpClient,
        private dataService: DataService,
        private navCtrl: NavController,
        private authSession: AuthSessionService,
        private managedDevices: ManagedDeviceService,
    ) { }

    init(): void {
        this.dataService.authCheck.subscribe(state => {
            if (
                state
                && !this.authSession.hasSession
                && this.dataService.auth?.uuid
                && this.dataService.auth?.token
            ) {
                this.checkAuthState()
            }
        });
    }

    isLogin(): boolean {
        return this.authSession.hasSession
            || !!(this.dataService.auth?.uuid && this.dataService.auth?.token)
    }

    // 检查是否有其他设备登录
    checkAuthState() {
        if (
            this.authSession.hasSession
            || !this.dataService.auth?.uuid
            || !this.dataService.auth?.token
        ) {
            return;
        }

        console.log('check auth expires');
        this.http.get(API.AUTH.CHECK, {
            params: {
                uuid: this.uuid,
                token: this.token
            }
        }).subscribe(resp => {
            console.log(resp);
        })
    }

    async login(username, password): Promise<boolean> {
        return this.http.get<BlinkerResponse>(API.AUTH.LOGIN, {
            params: {
                username: username,
                password: sha256(password)
            }
        })
            .toPromise()
            .then(resp => {
                console.log(resp);
                if (resp.message == 1000) {
                    this.dataService.auth = resp.detail
                    return true
                } else {
                    return false
                }
            })
            .catch(this.handleError);
    }

    // 发送邮箱验证码
    async sendEmailCode(email: string): Promise<boolean> {
        if (this.sendingEmailCode) return false;
        this.sendingEmailCode = true;

        try {
            const normalizedEmail = email.trim();
            const challenge = await firstValueFrom(this.http.get<AltchaChallenge>(
                API.GATEWAY.AUTH.ALTCHA_CHALLENGE,
                { context: gatewayContext('none') },
            ));
            const altcha = await solveAltcha(challenge, { timeoutMs: 30_000 });
            const response = await firstValueFrom(this.http.post<AilyEnvelope<null>>(
                API.GATEWAY.AUTH.EMAIL_CODE,
                { email: normalizedEmail, altcha },
                { context: gatewayContext('none') },
            ));
            this.assertGatewaySuccess(response, 'AUTH_EMAIL_CODE_FAILED');
            return true;
        } catch {
            return false;
        } finally {
            this.sendingEmailCode = false;
        }
    }

    // 使用邮箱+验证码登录（如果账号不存在会自动创建）
    async loginWithEmailCode(email: string, code: string): Promise<boolean> {
        if (this.loggingInWithEmailCode) return false;
        this.loggingInWithEmailCode = true;

        try {
            const response = await firstValueFrom(
                this.http.post<AilyEnvelope<GatewayTokenResponse>>(
                    API.GATEWAY.AUTH.EMAIL_LOGIN,
                    { email: email.trim(), code: code.trim() },
                    { context: gatewayContext('none') },
                ),
            );
            this.assertGatewaySuccess(response, 'AUTH_LOGIN_FAILED');
            this.authSession.establish(response.data);

            try {
                await this.loadGatewayAccount();
                return true;
            } catch (error) {
                this.clearGatewayLoginState();
                throw error;
            }
        } catch {
            return false;
        } finally {
            this.loggingInWithEmailCode = false;
        }
    }

    async loadGatewayAccount(): Promise<void> {
        const profile = await this.getCurrentGatewayUser();
        this.dataService.user = mapGatewayUser(profile);
        await this.managedDevices.loadAll();
    }

    async logout(): Promise<void> {
        try {
            if (this.authSession.accessToken) {
                await firstValueFrom(this.http.post(
                    API.GATEWAY.AUTH.LOGOUT,
                    {},
                    { context: gatewayContext('required', false) },
                ));
            }
        } finally {
            this.clearGatewayLoginState();
            this.dataService.removeAuthData();
            this.dataService.authDataExpire.next(true);
            this.dataService.authDataLoader.next(false);
            this.dataService.userDataLoader.next(false);
            await this.navCtrl.navigateRoot('/login');
        }
    }

    register(phone, smscode, password): Promise<boolean> {
        return this.http.get(API.AUTH.REGISTER, {
            params: {
                phone: phone,
                smsCode: smscode,
                password: sha256(password)
            }
        })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    this.dataService.auth = data.detail
                    // console.log("uuid:" + this.uuid);
                    // console.log("token:" + this.token);
                    return true;
                } else
                    return false;
            })
            .catch(this.handleError);
    }

    retrieve(phone, smscode, password): Promise<boolean> {
        return this.http.get(API.AUTH.RETRIEVE, {
            params: {
                phone: phone,
                smsCode: smscode,
                password: sha256(password)
            }
        })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    return true;
                } else
                    return false;
            })
            .catch(this.handleError);
    }

    getSmscode(phone, action): Promise<boolean> {
        return this.http
            .get(API.AUTH.SMSCODE, {
                params: {
                    phone: phone,
                    sendType: action
                }
            })
            .toPromise()
            .then(response => {
                console.log(response);
                let data = JSON.parse(JSON.stringify(response));
                if (data.message == 1000) {
                    return true;
                } else
                    return false;
            })
            .catch(this.handleError);
    }

    handleError(error: any): boolean {
        console.error('An error occurred', error);
        return false;
    }

    // GitHub 登录
    async loginWithGithub(): Promise<boolean> {
        return this.http.get<BlinkerResponse>(API.AUTH.GITHUB_LOGIN)
            .toPromise()
            .then(resp => {
                console.log(resp);
                if (resp.message == 1000) {
                    this.dataService.auth = resp.detail;
                    return true;
                } else {
                    return false;
                }
            })
            .catch(this.handleError);
    }

    // 微信登录
    async loginWithWechat(): Promise<boolean> {
        const request = Capacitor.isNativePlatform()
            ? Wechat.login().then(({ code, state }) =>
                this.http.post<BlinkerResponse>(API.AUTH.WECHAT_LOGIN, {
                    code,
                    state,
                    platform: Capacitor.getPlatform()
                }).toPromise()
            )
            : this.http.get<BlinkerResponse>(API.AUTH.WECHAT_LOGIN).toPromise();

        return request
            .then(resp => {
                console.log(resp);
                if (resp?.message == 1000) {
                    this.dataService.auth = resp.detail;
                    return true;
                } else {
                    return false;
                }
            })
            .catch(this.handleError);
    }

    private async getCurrentGatewayUser(): Promise<GatewayUserProfile> {
        const response = await firstValueFrom(this.http.get<AilyEnvelope<GatewayUserProfile>>(
            API.GATEWAY.AUTH.ME,
            { context: gatewayContext('required') },
        ));
        this.assertGatewaySuccess(response, 'AUTH_ME_FAILED');
        if (!response.data?.id || !response.data?.email) {
            throw new GatewayError(
                502,
                'AUTH_PROFILE_INVALID',
                'The user profile is incomplete.',
            );
        }
        return response.data;
    }

    private assertGatewaySuccess(
        response: AilyEnvelope<unknown>,
        fallbackCode: string,
    ): void {
        if (response?.status !== 200 || response.errorCode != null) {
            throw new GatewayError(
                Number(response?.status) || 400,
                String(response?.errorCode ?? fallbackCode),
                response?.errorMessage ?? 'Authentication request failed.',
                undefined,
                response,
            );
        }
    }

    private clearGatewayLoginState(): void {
        this.authSession.clear();
        this.managedDevices.clearLocal();
        this.dataService.user = undefined;
        this.dataService.userDataLoader.next(false);
        this.dataService.initCompleted.next(false);
        this.dataService.firstBoot = true;
    }
}
