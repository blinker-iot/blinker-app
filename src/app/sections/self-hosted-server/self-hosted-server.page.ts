import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule } from '@ionic/angular';
import { SelfHostedServerService } from '../../core/services/self-hosted-server.service';
import { HeroCardComponent } from '../../core/components/hero-card/hero-card.component';

@Component({
  selector: 'app-self-hosted-server',
  standalone: true,
  templateUrl: './self-hosted-server.page.html',
  styleUrls: ['./self-hosted-server.page.scss'],
  imports: [FormsModule, IonicModule, HeroCardComponent],
})
export class SelfHostedServerPage {
  serverAddress = '';
  serverKey = '';
  showKey = false;
  addressError = '';
  keyError = '';
  saved = false;
  hasSavedConfig = false;

  constructor(
    private readonly serverService: SelfHostedServerService,
    private readonly alertController: AlertController,
  ) {
    const savedConfig = this.serverService.getConfig();
    if (savedConfig) {
      this.serverAddress = savedConfig.address;
      this.serverKey = savedConfig.key;
      this.hasSavedConfig = true;
    }
  }

  save(): void {
    this.addressError = '';
    this.keyError = '';
    this.saved = false;

    const normalizedAddress = this.serverService.normalizeAddress(
      this.serverAddress,
    );
    if (!normalizedAddress) {
      this.addressError = '请输入包含协议的有效服务器地址';
    }
    if (!this.serverKey.trim()) {
      this.keyError = '请输入服务器密钥';
    }
    if (!normalizedAddress || this.keyError) return;

    const config = this.serverService.saveConfig(
      normalizedAddress,
      this.serverKey,
    );
    this.serverAddress = config.address;
    this.hasSavedConfig = true;
    this.saved = true;
  }

  clearValidation(field: 'address' | 'key'): void {
    this.saved = false;
    if (field === 'address') this.addressError = '';
    if (field === 'key') this.keyError = '';
  }

  toggleKeyVisibility(): void {
    this.showKey = !this.showKey;
  }

  async confirmClear(): Promise<void> {
    const alert = await this.alertController.create({
      header: '清除自建服务器配置？',
      message: '服务器地址和密钥将从当前设备中移除。',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '清除',
          role: 'destructive',
          handler: () => this.clear(),
        },
      ],
    });
    await alert.present();
  }

  private clear(): void {
    this.serverService.clearConfig();
    this.serverAddress = '';
    this.serverKey = '';
    this.showKey = false;
    this.addressError = '';
    this.keyError = '';
    this.saved = false;
    this.hasSavedConfig = false;
  }
}
