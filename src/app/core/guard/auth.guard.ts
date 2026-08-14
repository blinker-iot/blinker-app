import { Injectable } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';


@Injectable({
  providedIn: 'root'
})
export class AuthGuard  {
  constructor(
    private router: Router,
    private authService: AuthService,
  ) {
  }

  canActivate(): boolean | UrlTree {
    return this.authService.isLogin() || this.router.createUrlTree(['/login']);
  }
}
