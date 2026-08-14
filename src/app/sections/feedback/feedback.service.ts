import { Injectable } from '@angular/core';
import {
  FeedbackHttpService,
  FeedbackLabel,
  GatewayFeedbackResult,
} from 'src/app/core/gateway/feedback-http.service';

export interface FeedbackRequest {
  title: string;
  content: string;
  label: FeedbackLabel;
  email?: string;
  userAgent?: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  constructor(private readonly gatewayFeedback: FeedbackHttpService) {}

  newFeedback(feedback: FeedbackRequest): Promise<GatewayFeedbackResult> {
    return this.gatewayFeedback.submit(feedback);
  }
}
