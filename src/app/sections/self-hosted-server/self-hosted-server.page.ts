import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GatewayHttpError } from '../../core/model/response.model';
import { AlertController, IonicModule } from '@ionic/angular';
import { SelfHostedServerConfig, SelfHostedServerService } from '../../core/services/self-hosted-server.service';
import { DeviceV2Service } from '../../core/services/device-v2.service';
import { HeroCardComponent } from '../../core/components/hero-card/hero-card.component';

const ERROR_MESSAGES: Record<string, string> = {
  SELF_HOSTED_SERVER_INVALID_INPUT: '请检查服务器地址和密钥',
  SELF_HOSTED_SERVER_INVALID_URL: '请输入有效的公网 HTTP 或 HTTPS 地址',
  SELF_HOSTED_SERVER_ADDRESS_FORBIDDEN: '服务器必须能通过公网访问',
  SELF_HOSTED_SERVER_KEY_REQUIRED: '首次保存或更换地址时需要填写密钥',
  SELF_HOSTED_SERVER_AUTH_FAILED: '服务器密钥验证失败，请检查密钥',
  SELF_HOSTED_SERVER_INCOMPATIBLE: '服务器版本或 Gateway 公钥配置不匹配',
  SELF_HOSTED_SERVER_UNAVAILABLE: '暂时无法连接服务器，请稍后重试',
  SELF_HOSTED_SERVER_TIMEOUT: '连接服务器超时，请稍后重试',
  SELF_HOSTED_SERVER_KEY_UNAVAILABLE: '服务端暂时无法读取已保存的密钥',
  SELF_HOSTED_SERVER_HAS_DEVICES: '账户已有设备，暂不支持切换服务器或清除配置',
  UNSUPPORTED_TENANT_RELATIONS: '请先处理账户的设备分享关系',
  SELF_HOSTED_SERVER_BUSY: '服务正在处理其他操作，请稍后重试',
  SELF_HOSTED_SERVER_REVISION_CONFLICT: '配置已发生变化，请重新读取后重试',
  SELF_HOSTED_SERVER_TENANT_NOT_ACTIVE: '账户当前不可用，请稍后重试',
};

@Component({
  selector: 'app-self-hosted-server',
  standalone: true,
  templateUrl: './self-hosted-server.page.html',
  styleUrls: ['./self-hosted-server.page.scss'],
  imports: [FormsModule, IonicModule, HeroCardComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SelfHostedServerPage {
  serverAddress = '';
  serverKey = '';
  showKey = false;
  addressError = '';
  keyError = '';
  errorMessage = '';
  saved = false;
  loading = true;
  saving = false;
  config: SelfHostedServerConfig | null = null;

  constructor(
    private readonly serverService: SelfHostedServerService,
    private readonly alertController: AlertController,
    private readonly deviceV2: DeviceV2Service,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get hasSavedConfig(): boolean {
    return !!this.config?.keyConfigured;
  }

  get busy(): boolean {
    return this.loading || this.saving;
  }

  get statusText(): string {
    if (this.loading) return '正在读取配置';
    if (!this.config) return '配置读取失败';
    if (this.config.state === 'enabled') return '已启用';
    if (this.config.state === 'unavailable') return '暂不可用';
    return '未配置';
  }

  async ionViewWillEnter(): Promise<void> {
    this.saved = false;
    this.serverKey = '';
    this.showKey = false;
    this.errorMessage = '';
    this.loading = true;
    try {
      this.applyConfig(await this.serverService.getConfig());
    } catch (error) {
      this.config = null;
      this.errorMessage = this.describeError(error);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async save(): Promise<void> {
    if (this.busy || !this.config) return;
    this.addressError = '';
    this.keyError = '';
    this.errorMessage = '';
    this.saved = false;
    const address = this.serverService.normalizeAddress(this.serverAddress);
    if (!address) this.addressError = '请输入有效的公网 HTTP 或 HTTPS 地址';
    const keepKey = this.hasSavedConfig && address === this.config.serverUrl && this.serverKey === '';
    if (!keepKey && !this.serverKey) this.keyError = '请输入服务器密钥';
    if (!address || this.keyError) return;

    this.saving = true;
    try {
      const config = await this.serverService.saveConfig(
        address, keepKey ? undefined : this.serverKey,
      );
      this.applyConfig(config);
      this.saved = true;
      await this.reconnect();
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  clearValidation(field: 'address' | 'key'): void {
    this.saved = false;
    this.errorMessage = '';
    if (field === 'address') this.addressError = '';
    if (field === 'key') this.keyError = '';
  }

  toggleKeyVisibility(): void {
    this.showKey = !this.showKey;
  }

  async confirmClear(): Promise<void> {
    if (this.busy) return;
    const alert = await this.alertController.create({
      header: '清除自建服务器配置？',
      message: '账户将恢复使用平台服务器。已有设备时暂不支持清除配置。',
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '清除', role: 'destructive', handler: () => { void this.clear(); } },
      ],
    });
    await alert.present();
  }

  private async clear(): Promise<void> {
    if (this.busy || !this.hasSavedConfig) return;
    this.saving = true;
    this.saved = false;
    this.errorMessage = '';
    try {
      this.applyConfig(await this.serverService.clearConfig());
      await this.reconnect();
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  private applyConfig(config: SelfHostedServerConfig): void {
    this.config = config;
    this.serverAddress = config.serverUrl ?? '';
    this.serverKey = '';
    this.showKey = false;
    this.addressError = '';
    this.keyError = '';
    this.errorMessage = config.lastErrorCode
      ? ERROR_MESSAGES[config.lastErrorCode] ?? '服务器暂不可用，请稍后重试'
      : '';
  }

  private async reconnect(): Promise<void> {
    try {
      await this.deviceV2.stop();
      await this.deviceV2.start();
    } catch {
      this.errorMessage = '配置已生效，但设备连接尚未恢复，请稍后重新进入设备页面';
    }
  }

  private describeError(error: unknown): string {
    const response = error instanceof GatewayHttpError ? error : null;
    const code = response?.code ?? '';
    if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (response?.httpStatus === 401) return '登录已过期，请重新登录';
    return '操作未完成，请检查网络后重试';
  }
}
