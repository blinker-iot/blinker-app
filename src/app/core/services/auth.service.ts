import { Injectable } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import { GatewayAccountService } from '../gateway/gateway-account.service';
import { GatewayLoginFacade } from '../gateway/gateway-login.facade';
import { GatewaySessionService } from '../gateway/gateway-session.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private readonly loginFacade: GatewayLoginFacade,
    private readonly account: GatewayAccountService,
    private readonly session: GatewaySessionService,
    private readonly navCtrl: NavController,
  ) {}

  init(): void {}

  isLogin(): boolean {
    return this.session.hasSession;
  }

  sendEmailCode(email: string): Promise<boolean> {
    return this.loginFacade.sendCode(email);
  }

  loginWithEmailCode(email: string, code: string): Promise<boolean> {
    return this.loginFacade.login(email, code);
  }

  async logout(): Promise<void> {
    try {
      await this.account.logout();
    } finally {
      this.session.clear();
      await this.navCtrl.navigateRoot('/login');
    }
  }
}
