import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API } from 'src/app/configs/app.config';
import { DataService } from 'src/app/core/services/data.service';

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  get uuid() {
    return this.dataService.auth.uuid
  }

  get token() {
    return this.dataService.auth.token
  }

  constructor(
    private http: HttpClient,
    private dataService: DataService
  ) { }

  newFeedback(feedback): Promise<boolean> {
    console.log(feedback);
    
    return this.http
      .post(API.FEEDBACK,
        {
          "uuid": this.uuid,
          'token': this.token,
          "recordType": feedback.recordType,
          "deviceType": feedback.deviceType,
          "content": feedback.content,
        })
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.message == 1000) {
          return true;
        } else {
          return false;
        }
      })
  }

}
