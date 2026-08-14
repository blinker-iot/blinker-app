import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { gatewayUrl } from './gateway.config';
import { gatewayContext } from './gateway.context';
import { getSavedFeedbackId } from './feedback-result';

export type FeedbackLabel = 'bug' | 'feature' | 'question' | 'other';

export interface GatewayFeedbackRequest {
  title: string;
  content: string;
  label: FeedbackLabel;
  email?: string;
  userAgent?: string;
}

export interface GatewayFeedbackResult {
  saved: true;
  issueSynced: boolean;
  feedbackId?: string | number;
}

@Injectable({ providedIn: 'root' })
export class FeedbackHttpService {
  constructor(private http: HttpClient) {}

  async submit(feedback: GatewayFeedbackRequest): Promise<GatewayFeedbackResult> {
    try {
      const response = await firstValueFrom(this.http.post(
        gatewayUrl('/api/v1/feedback/submit'),
        feedback,
        { context: gatewayContext('optional'), observe: 'response' },
      ));
      if (response.status !== 201) throw new Error('Unexpected feedback response status.');
      return { saved: true, issueSynced: true };
    } catch (error) {
      const feedbackId = getSavedFeedbackId(error);
      if (typeof feedbackId !== 'undefined') {
        return { saved: true, issueSynced: false, feedbackId };
      }
      throw error;
    }
  }
}
