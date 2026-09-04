import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import { GatewayHttpError } from 'src/app/core/model/response.model';
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FeedbackService,
} from './feedback.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FeedbackService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(FeedbackService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('treats a feedback response body status of 201 as complete', async () => {
    const pending = service.newFeedback({
      title: '[设备问题] 控制异常',
      content: '设备控制后没有响应',
      label: 'bug',
      userAgent: 'test-agent',
      email: 'user@example.com',
    });

    const request = httpTesting.expectOne(API.FEEDBACK.SUBMIT);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: '[设备问题] 控制异常',
      content: '设备控制后没有响应',
      label: 'bug',
      userAgent: 'test-agent',
      email: 'user@example.com',
    });
    expect(request.request.body.uuid).toBeUndefined();
    expect(request.request.body.token).toBeUndefined();
    expect(request.request.body.recordType).toBeUndefined();
    request.flush(
      {
        status: 201,
        data: {
          feedbackId: 42,
          issueId: '5200288733',
          issueNumber: 24,
          issueUrl: 'https://github.com/blinker-iot/blinker-app/issues/24',
        },
        messages: 'Feedback created successfully',
      }
    );

    await expect(pending).resolves.toEqual({
      status: 'complete',
      feedbackId: 42,
      issueStatus: undefined,
    });
  });

  it('returns partial when a non-2xx response contains feedbackId', async () => {
    const pending = service.newFeedback({
      title: '反馈',
      content: '反馈内容',
    });

    const request = httpTesting.expectOne(API.FEEDBACK.SUBMIT);
    expect(request.request.body.label).toBe('other');
    request.flush(
      {
        code: 'GITHUB_FEEDBACK_UNAVAILABLE',
        message: 'GitHub unavailable',
        data: { feedbackId: 7, issueStatus: 'failed' },
      },
      { status: 502, statusText: 'Bad Gateway' }
    );

    await expect(pending).resolves.toEqual({
      status: 'partial',
      feedbackId: 7,
      issueStatus: 'failed',
    });
  });

  it('rethrows an ordinary submission failure without feedbackId', async () => {
    const pending = service.newFeedback({
      title: '反馈',
      content: '反馈内容',
    });

    const request = httpTesting.expectOne(API.FEEDBACK.SUBMIT);
    request.flush(
      { code: 'INVALID_REQUEST', message: 'content is required' },
      { status: 400, statusText: 'Bad Request' }
    );

    await expect(pending).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('recognizes normalized Gateway partial-success errors', async () => {
    const http = {
      post: () => throwError(() => new GatewayHttpError({
        httpStatus: 503,
        code: 'GITHUB_FEEDBACK_NOT_CONFIGURED',
        message: 'GitHub unavailable',
        data: { feedbackId: 'feedback-1', issueStatus: 'failed' },
      })),
    };
    const normalizedService = new FeedbackService(http as any);

    await expect(normalizedService.newFeedback({
      title: '反馈',
      content: '反馈内容',
    })).resolves.toEqual({
      status: 'partial',
      feedbackId: 'feedback-1',
      issueStatus: 'failed',
    });
  });

  it('uploads one multipart file and returns the public URL', async () => {
    const file = new Blob(['image'], { type: 'image/png' });
    const pending = service.uploadImage(file, 'feedback.png');

    const request = httpTesting.expectOne(API.FEEDBACK.UPLOAD_IMAGE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('file')).toBeTruthy();
    request.flush({
      status: 200,
      data: {
        url: 'https://images.example/feedback.png',
        path: 'issues/feedback.png',
        size: 5,
        content_type: 'image/png',
      },
      messages: 'Feedback image uploaded successfully',
    });

    await expect(pending).resolves.toBe(
      'https://images.example/feedback.png'
    );
  });

  it('rejects an unsupported image type before sending a request', async () => {
    const file = new Blob(['not-an-image'], { type: 'text/plain' });

    await expect(service.uploadImage(file, 'feedback.txt')).rejects.toThrow(
      '图片仅支持 JPEG、PNG、GIF 或 WebP 格式'
    );
  });

  it('rejects an image larger than 10 MiB before sending a request', async () => {
    const file = new Blob(
      [new Uint8Array(FEEDBACK_IMAGE_MAX_BYTES + 1)],
      { type: 'image/png' }
    );

    await expect(service.uploadImage(file, 'feedback.png')).rejects.toThrow(
      '图片大小不能超过 10 MiB'
    );
  });
});
