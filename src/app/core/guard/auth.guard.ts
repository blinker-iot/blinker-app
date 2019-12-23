import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router
} from '@angular/router';
import { Observable } from 'rxjs';
import { UserService } from '../services/user.service';
import { NavController } from '@ionic/angular';
import { DataService } from '../services/data.service';


@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private userService: UserService,
    private dataService: DataService,
    private navCtrl: NavController
  ) {
  }

  canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    return true
    // return this.userService.isLogin().then(result => {
    // if (result) {
    // console.log('canActivate');
    // return this.dataService.authDataLoader
    //   .asObservable().subscribe(
    //     (loaded: boolean) => {
    //       console.log(loaded);

    //       if (loaded) {
    //         if (this.userService.isLogin()) {
    //           return true;
    //         } else {
    //           console.log('guard:false');
    //           this.userService.logout();
    //           this.navCtrl.navigateRoot('/login');
    //           return false;
    //         }
    //       }
    //     }
    //   )
    // .subscribe((loaded: boolean) => {
    //   if (loaded) {
    //     if (this.userService.isLogin()) {
    //       return true;
    //     } else {
    //       console.log('guard:false');
    //       this.userService.logout();
    //       this.navCtrl.navigateRoot('/login');
    //       return false;
    //     }
    //   }
    // })
  }
}
