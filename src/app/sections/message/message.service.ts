import { Injectable } from '@angular/core';
import { API } from 'src/app/configs/app.config';
import { HttpClient } from '@angular/common/http';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerResponse } from 'src/app/core/model/response.model';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  list = [];

  constructor(
    private http: HttpClient,
    private dataService: DataService
  ) { }

  // 2019.10.22 消息需要最新的前
  getMessage(page): Promise<boolean> {
    return this.http
      .get(API.MESSAGE, {
        params: {
          "uuid": this.uuid,
          "token": this.token,
          "unread": "0",
          "page": "1",
          "perPage": "15"
        }
      })
      .toPromise()
      .then((resp: BlinkerResponse) => {
        console.log(resp);
        if (resp.message == 1000) {
          this.list = resp.detail.messages
          return true;
        } else {
          return false;
        }
      })
  }


  delMessage(message) {
    return this.http
      .delete(API.MESSAGE, {
        params: {
          "uuid": this.uuid,
          "token": this.token,
          "msgId": message.id,
        }
      })
      .toPromise()
      .then((resp: BlinkerResponse) => {
        console.log(resp);
        if (resp.message == 1000) {
          let index = this.list.indexOf(message);
          if (index > -1) this.list.splice(index, 1);
          return true;
        } else {
          return false;
        }
      })
  }

  delAllMessage() {

  }


}
