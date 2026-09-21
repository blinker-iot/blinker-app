import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonicModule, NavController } from '@ionic/angular';
import { DeviceV2ShareInvitationService } from 'src/app/core/services/device-v2-share-invitation.service';
import { DataService } from 'src/app/core/services/data.service';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-share-invitation',
  imports: [IonicModule, DatePipe],
  templateUrl: './share-invitation.page.html',
})
export class ShareInvitationPage {
  opening = false;
  openError = '';
  private leavingForLogin = false;
  constructor(public readonly invitation: DeviceV2ShareInvitationService,
    private readonly users: UserService, private readonly data: DataService, private readonly nav: NavController) {}

  ionViewWillEnter(): void { this.leavingForLogin = false; void this.invitation.refresh(); }
  ionViewDidLeave(): void {
    if (!this.leavingForLogin) this.invitation.clear();
  }
  login(): void { this.leavingForLogin = true; void this.nav.navigateForward('/login'); }
  cancel(): void {
    this.invitation.clear();
    void this.nav.navigateBack('/share-manager');
  }
  async accept(): Promise<void> {
    await this.invitation.accept();
    if (this.invitation.state().result?.share.state === 'active') await this.openDevice();
  }
  async openDevice(): Promise<void> {
    const result = this.invitation.state().result;
    if (this.opening || result?.share.state !== 'active') return;
    this.opening = true; this.openError = '';
    const epoch = this.data.sessionEpoch;
    try {
      const loaded = await this.users.getAllInfo();
      if (epoch !== this.data.sessionEpoch || this.invitation.state().result !== result) return;
      if (!loaded || !this.data.getDevice(result.logicalDeviceId)) {
        this.openError = '分享已领取，设备列表暂未刷新，请重试进入'; return;
      }
      await this.nav.navigateForward(['/device', result.logicalDeviceId]);
      if (this.invitation.state().result === result) this.invitation.clear();
    } catch {
      if (epoch === this.data.sessionEpoch) this.openError = '分享已领取，暂时无法进入设备，请重试';
    } finally { this.opening = false; }
  }
}
