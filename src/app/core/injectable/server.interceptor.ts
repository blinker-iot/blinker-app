import { Injectable } from "@angular/core";
import { HttpRequest, HttpResponse, HttpErrorResponse, HttpHandler, HttpInterceptor } from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { tap, catchError } from 'rxjs/operators';
import { NavController } from '@ionic/angular';
import { NoticeService } from "../services/notice.service";
import { DataService } from "../services/data.service";
import { environment } from "../../../environments/environment";
import { isGatewayRequest } from '../gateway/gateway.config';

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
    private navCtrl: NavController,
    private noticeService: NoticeService,
    private dataService: DataService
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    if (isGatewayRequest(req.url)) return next.handle(req);

    const isLegacyRequest = req.url.startsWith('https://iot.yiyu.pro/api/');
    if (!isLegacyRequest) return next.handle(req);

    const shouldAttachLegacyAuth =
      !req.params.has('uuid') &&
      typeof this.uuid !== 'undefined' &&
      typeof this.token !== 'undefined';
    const newReq = shouldAttachLegacyAuth
      ? req.clone({ setParams: { uuid: this.uuid, token: this.token } })
      : req;
    return next.handle(newReq).pipe(
      tap((event: any) => {
        if (event instanceof HttpResponse) {
          if (typeof event.body?.message != 'undefined' && event.body.message != 1000) {
            this.processErrorCode(event.body.message)
          }
        }
      }),
      catchError((err: any) => {
        if (err instanceof HttpErrorResponse) {
          this.processErrorResponse(err.status);
        }
        return throwError(() => err);
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
      // 开发模式下不强制跳转登录页
      if (!environment.production) {
        console.log('[DEV MODE] 跳过登录跳转，错误码:', code);
        return;
      }
      this.dataService.removeAuthData();
      this.navCtrl.navigateRoot('/login');
    } else {
      this.noticeService.showToast(code)
    }
  }

}
