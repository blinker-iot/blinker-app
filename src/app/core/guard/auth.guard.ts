import { Injectable } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { GatewaySessionService } from '../gateway/gateway-session.service';


@Injectable({
  providedIn: 'root'
})
export class AuthGuard  {
  constructor(
    private router: Router,
    private session: GatewaySessionService,
  ) {
  }

  canActivate(): boolean | UrlTree {
    return this.session.hasSession || this.router.createUrlTree(['/login']);
  }
}
