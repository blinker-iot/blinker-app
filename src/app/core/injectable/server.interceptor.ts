import { Injectable } from "@angular/core";
import {
  HttpRequest,
  HttpResponse,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor
} from "@angular/common/http";
import { Observable } from "rxjs";
import { map, catchError } from 'rxjs/operators';
import { Events, NavController } from '@ionic/angular';
import { AuthService } from "../services/auth.service";

@Injectable()
export class ServerInterceptor implements HttpInterceptor {

  constructor(
    public events: Events,
    private authService: AuthService,
    private navCtrl: NavController
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      map((event: HttpEvent<any>) => {
        if (event instanceof HttpResponse && event.status == 200) {
          // console.log(req);
          // console.log(event);
          if (typeof event.body.message != 'undefined' && event.body.message != 1000) {
            this.processErrorCode(event.body.message)
          }
          return event;
        }
      }),
      catchError((err: any, caught) => {
        if (err instanceof HttpErrorResponse) {
          // if (err.status === 403) {
          //   console.info('err.error =', err.error, ';');
          // }
          // if (err.status >= 500) {
          //   console.info('err.error =', err.error, ';');
          // }
          this.processErrorResponse(err.status);
          return Observable.throw(err);
        }
      })
    );
  }

  processErrorResponse(statusCode) {
    this.events.publish("provider:notice", 9999);
  }

  processErrorCode(code) {
    // console.log(code);
    //跳转到登录页
    if (code == 1408) {
      this.authService.logout();
      this.navCtrl.navigateRoot('/login');
    }
    this.events.publish("provider:notice", code);
  }

}