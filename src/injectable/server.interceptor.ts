import { Injectable } from "@angular/core";
import {
  HttpRequest,
  HttpResponse,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor
} from "@angular/common/http";
import { Observable } from "rxjs/Observable";
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';
import { Events } from 'ionic-angular';

@Injectable()
export class ServerInterceptor implements HttpInterceptor {

  constructor(
    public events: Events
  ) {

  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req)
      .map((event: HttpEvent<any>) => {
        if (event instanceof HttpResponse && event.status == 200) {
          if (event.body.message != 1000) {
            this.processErrorCode(event.body.message)
          }
          return event;
        }
      })
      .catch((err: any, caught) => {
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
      });
  }

  processErrorResponse(statusCode) {
    this.events.publish("provider:notice", 9999);
  }

  processErrorCode(code) {
    this.events.publish("provider:notice", code);
  }

}