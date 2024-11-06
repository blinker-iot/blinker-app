import { Injectable } from "@angular/core";
import {
  HttpRequest,
  HttpResponse,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpParams
} from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { map, catchError } from 'rxjs/operators';
import { NavController } from '@ionic/angular';
import { AuthService } from "../services/auth.service";
import { NoticeService } from "../services/notice.service";
import { DataService } from "../services/data.service";

@Injectable()
export class ServerInterceptor implements HttpInterceptor {

  get uuid() {
    if (this.dataService.auth != null)
      return this.dataService.auth.uuid
  }

  get token() {
    if (this.dataService.auth != null)
      return this.dataService.auth.token
  }

  constructor(
    private authService: AuthService,
    private navCtrl: NavController,
    private noticeService: NoticeService,
    private dataService: DataService
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    // console.log(req.params.has('uuid'));
    let newReq;
    if (!req.params.has('uuid') && typeof this.token != 'undefined') {
      newReq = req.clone({
        params: new HttpParams({ fromString: req.params.toString() }).append('uuid', this.uuid).append('token', this.token)
      });
    } else {
      newReq = req.clone()
    }
    return next.handle(newReq).pipe(
      map((event: any) => {
        if (event instanceof HttpResponse && event.status == 200) {
          if (typeof event.body.message != 'undefined' && event.body.message != 1000) {
            this.processErrorCode(event.body.message)
          }
          return event;
        }
      }),
      catchError((err: any, caught) => {
        if (err instanceof HttpErrorResponse) {
          console.log('ErrorResponse', err.status, err);
          this.processErrorResponse(err.status);
          return throwError(err);
        }
      })
    );
  }

  processErrorResponse(statusCode) {
    this.noticeService.showToast(9999)
  }

  processErrorCode(code) {
    // console.log(code);
    // 跳转到登录页
    if (code == 1408) {
      this.authService.logout();
      this.navCtrl.navigateRoot('/login');
    } else {
      this.noticeService.showToast(code)
    }
  }

}