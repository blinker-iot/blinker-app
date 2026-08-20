import 'zone.js';
import {
  ApplicationRef,
  NgZone,
  provideZoneChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { DataService } from 'src/app/core/services/data.service';
import { FeedbackPage } from './feedback.component';
import {
  FeedbackService,
  FeedbackSubmitResult,
} from './feedback.service';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('FeedbackPage', () => {
  let fixture: ComponentFixture<FeedbackPage>;
  let page: FeedbackPage;
  let feedbackService: {
    newFeedback: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    localStorage.clear();
    feedbackService = { newFeedback: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [FeedbackPage],
      providers: [
        provideZoneChangeDetection(),
        provideIonicAngular(),
        provideTranslateService(),
        { provide: FeedbackService, useValue: feedbackService },
        { provide: DataService, useValue: {} },
        {
          provide: NavController,
          useValue: { navigateBack: vi.fn().mockResolvedValue(true) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackPage);
    page = fixture.componentInstance;
    fixture.autoDetectChanges();
    page.title = '设备控制异常';
    page.content = '设备控制后一直没有任何响应';
    fixture.detectChanges();
  });

  it('renders success after an asynchronous submission completes', async () => {
    const pending = deferred<FeedbackSubmitResult>();
    feedbackService.newFeedback.mockReturnValue(pending.promise);
    const submitSpy = vi.spyOn(page, 'submit');
    const form = fixture.nativeElement.querySelector(
      '.feedback-form'
    ) as HTMLFormElement | null;

    form?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await vi.waitFor(() => {
      expect(page.isSubmitting).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('正在提交');
    });

    const operation = submitSpy.mock.results[0]?.value as Promise<void>;
    TestBed.inject(NgZone).run(() => {
      pending.resolve({ status: 'complete', feedbackId: 3 });
    });
    await operation;
    TestBed.inject(ApplicationRef).tick();

    await vi.waitFor(() => {
      expect(page.isSubmitting).toBe(false);
      expect(page.isDone).toBe(true);
      expect(
        fixture.nativeElement.querySelector('.feedback-form')
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('.success-card')
      ).not.toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('正在提交');
    });
  });
});
