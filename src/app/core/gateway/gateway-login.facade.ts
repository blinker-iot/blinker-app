import { Injectable } from '@angular/core';
import { GatewayAccountService } from './gateway-account.service';

@Injectable({ providedIn: 'root' })
export class GatewayLoginFacade {
  private sendingCode = false;
  private loggingIn = false;

  constructor(private readonly account: GatewayAccountService) {}

  async sendCode(email: string): Promise<boolean> {
    if (this.sendingCode) return false;
    this.sendingCode = true;
    try {
      await this.account.sendEmailCode(email);
      return true;
    } catch {
      return false;
    } finally {
      this.sendingCode = false;
    }
  }

  async login(email: string, code: string): Promise<boolean> {
    if (this.loggingIn) return false;
    this.loggingIn = true;
    try {
      await this.account.login(email, code);
      return true;
    } catch {
      return false;
    } finally {
      this.loggingIn = false;
    }
  }
}
