import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API } from 'src/app/configs/api.config';
import { DataService } from 'src/app/core/services/data.service';
import { firstValueFrom } from 'rxjs';

export interface FeedbackRequest {
  recordType: number;
  content: string;
}

interface FeedbackResponse {
  message?: number | string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  get uuid() {
    return this.dataService.auth?.uuid || '';
  }

  get token() {
    return this.dataService.auth?.token || '';
  }

  constructor(
    private http: HttpClient,
    private dataService: DataService
  ) { }

  async newFeedback(feedback: FeedbackRequest): Promise<boolean> {
    const response = await firstValueFrom(
      this.http.post<FeedbackResponse>(API.FEEDBACK, {
        'uuid': this.uuid,
        'token': this.token,
        'recordType': feedback.recordType,
        'content': feedback.content,
      })
    );

    return String(response?.message) === '1000';
  }
}
