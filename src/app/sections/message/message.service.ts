import { Injectable } from '@angular/core';
import { API } from 'src/app/configs/api.config';
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

  getMessage(page = 1): Promise<boolean> {
    return this.http
      .get(API.MESSAGE, {
        params: {
          "uuid": this.uuid,
          "token": this.token,
          "unread": "0",
          "page": page.toString(),
          "perPage": "15"
        }
      })
      .toPromise()
      .then((resp: BlinkerResponse) => {
        console.log(resp);
        if (resp.message == 1000) {
          this.list = this.list.concat(resp.detail.messages)
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
