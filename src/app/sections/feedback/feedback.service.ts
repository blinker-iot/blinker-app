import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { API } from 'src/app/configs/api.config';
import {
  FeedbackSubmitData,
  FeedbackSubmitResponse,
  FeedbackUploadResponse,
  GatewayHttpError,
} from 'src/app/core/model/response.model';
import { firstValueFrom } from 'rxjs';

export const FEEDBACK_IMAGE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
].join(',');
export const FEEDBACK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export function getFeedbackImageValidationError(file: Blob): string {
  if (!FEEDBACK_IMAGE_ACCEPT.split(',').includes(file.type.toLowerCase())) {
    return '图片仅支持 JPEG、PNG、GIF 或 WebP 格式';
  }
  if (file.size > FEEDBACK_IMAGE_MAX_BYTES) {
    return '图片大小不能超过 10 MiB';
  }
  return '';
}

export interface GatewayFeedbackRequest {
  title: string;
  content: string;
  userAgent?: string;
  email?: string;
}

export interface LegacyFeedbackRequest {
  recordType: number;
  content: string;
}

export type FeedbackRequest = GatewayFeedbackRequest | LegacyFeedbackRequest;

export interface FeedbackSubmitResult {
  status: 'complete' | 'partial';
  feedbackId?: string | number;
  issueStatus?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  constructor(private http: HttpClient) { }

  async newFeedback(feedback: FeedbackRequest): Promise<FeedbackSubmitResult> {
    const content = feedback.content.trim();
    const title = 'title' in feedback
      ? feedback.title.trim()
      : this.legacyTitle(content);
    try {
      const response = await firstValueFrom(
        this.http.post<FeedbackSubmitResponse>(API.FEEDBACK.SUBMIT, {
          title,
          content,
          label: 'other',
          userAgent: 'userAgent' in feedback ? feedback.userAgent : undefined,
          email: 'email' in feedback ? feedback.email : undefined,
        }, { observe: 'response' })
      );

      if (response.status !== 201) {
        throw new Error(
          'Unexpected feedback response status: ' + response.status
        );
      }

      return this.toResult('complete', response.body?.data);
    } catch (error) {
      const data = this.readErrorData(error);
      if (this.hasFeedbackId(data?.feedbackId)) {
        return this.toResult('partial', data);
      }
      throw error;
    }
  }

  async uploadImage(file: Blob, filename = 'feedback-image'): Promise<string> {
    const validationError = getFeedbackImageValidationError(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const formData = new FormData();
    formData.append('file', file, file instanceof File ? file.name : filename);
    const response = await firstValueFrom(
      this.http.post<FeedbackUploadResponse>(
        API.FEEDBACK.UPLOAD_IMAGE,
        formData
      )
    );
    const url = response.data?.url?.trim();
    if (!url) {
      throw new Error('Feedback image response is missing data.url');
    }
    return url;
  }

  private readErrorData(error: unknown): FeedbackSubmitData | undefined {
    if (error instanceof GatewayHttpError) {
      return error.data as FeedbackSubmitData | undefined;
    }
    if (error instanceof HttpErrorResponse) {
      return error.error?.data as FeedbackSubmitData | undefined;
    }
    return undefined;
  }

  private hasFeedbackId(value: unknown): value is string | number {
    return (typeof value === 'string' && value.trim().length > 0)
      || (typeof value === 'number' && Number.isFinite(value));
  }

  private toResult(
    status: FeedbackSubmitResult['status'],
    data?: FeedbackSubmitData | null
  ): FeedbackSubmitResult {
    return {
      status,
      feedbackId: data?.feedbackId,
      issueStatus: data?.issueStatus,
    };
  }

  private legacyTitle(content: string): string {
    const firstLine = content.split('\n', 1)[0]?.trim() || '';
    return firstLine.replace(/^标题：/, '').trim() || 'App feedback';
  }
}
