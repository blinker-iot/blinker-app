import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { gatewayContext } from '../../core/injectable/gateway.context';

export type FeedbackLabel = 'bug' | 'feature' | 'question' | 'other';

export interface FeedbackRequest {
  title: string;
  content: string;
  label: FeedbackLabel;
  email?: string;
  userAgent?: string;
}

export interface FeedbackResult {
  saved: true;
  issueSynced: boolean;
  feedbackId?: string | number;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  constructor(private readonly http: HttpClient) {}

  async newFeedback(feedback: FeedbackRequest): Promise<FeedbackResult> {
    try {
      const response = await firstValueFrom(this.http.post(
        API.GATEWAY.FEEDBACK.SUBMIT,
        feedback,
        { context: gatewayContext('optional'), observe: 'response' },
      ));
      if (response.status !== 201) {
        throw new Error('Unexpected feedback response status.');
      }
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

export function getSavedFeedbackId(error: any): string | number | undefined {
  const candidates = [
    error,
    error?.data,
    error?.details,
    error?.details?.data,
    error?.error,
    error?.error?.data,
    error?.cause?.error,
    error?.cause?.error?.data,
  ];
  for (const candidate of candidates) {
    if (typeof candidate?.feedbackId === 'string' || typeof candidate?.feedbackId === 'number') {
      return candidate.feedbackId;
    }
  }
  return undefined;
}
