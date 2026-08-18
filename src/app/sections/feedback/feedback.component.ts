import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { FeedbackService } from './feedback.service';
import { DataService } from 'src/app/core/services/data.service';

type FeedbackTypeId = 'device' | 'account' | 'feature' | 'other';

interface FeedbackTypeOption {
  value: FeedbackTypeId;
  gatewayLabel: 'bug' | 'feature' | 'question' | 'other';
  label: string;
  description: string;
  icon: string;
}

interface FeedbackDraft {
  feedbackType: FeedbackTypeId;
  title: string;
  content: string;
  email: string;
}

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  imports: [FormsModule, IonicModule, TranslatePipe],
})
export class FeedbackPage implements OnInit, OnDestroy {
  private readonly draftStorageKey = 'blinker_feedback_draft';

  readonly feedbackTypes: readonly FeedbackTypeOption[] = [
    {
      value: 'device',
      gatewayLabel: 'bug',
      label: '设备问题',
      description: '配网、控制或设备异常',
      icon: 'fa-microchip',
    },
    {
      value: 'account',
      gatewayLabel: 'question',
      label: '账户问题',
      description: '登录、资料或设备共享',
      icon: 'fa-user-circle',
    },
    {
      value: 'feature',
      gatewayLabel: 'feature',
      label: '功能建议',
      description: '告诉我们你期待的功能',
      icon: 'fa-lightbulb',
    },
    {
      value: 'other',
      gatewayLabel: 'other',
      label: '其他问题',
      description: '其他意见与使用反馈',
      icon: 'fa-message-dots',
    },
  ];

  feedbackType: FeedbackTypeId = 'device';
  title = '';
  content = '';
  email = '';
  isSubmitting = false;
  isDone = false;
  issueSyncFailed = false;
  errorMessage = '';

  get isDeveloper() {
    return this.dataService.isDeveloper;
  }

  get selectedTypeLabel(): string {
    return (
      this.feedbackTypes.find((type) => type.value === this.feedbackType)
        ?.label || '反馈'
    );
  }

  constructor(
    private feedbackService: FeedbackService,
    private dataService: DataService,
    private navController: NavController
  ) {}

  ngOnInit() {
    this.loadDraft();
  }

  ngOnDestroy(): void {
    if (!this.isDone) {
      this.saveDraft();
    }
  }

  selectType(type: FeedbackTypeId): void {
    if (this.isSubmitting) return;
    this.feedbackType = type;
    this.errorMessage = '';
    this.saveDraft();
  }

  onFormChange(): void {
    this.errorMessage = '';
    this.saveDraft();
  }

  async submit(): Promise<void> {
    const title = this.title.trim();
    const content = this.content.trim();
    const email = this.email.trim();

    if (!title) {
      this.errorMessage = '请填写反馈标题';
      return;
    }
    if (!content) {
      this.errorMessage = '请描述你遇到的问题或建议';
      return;
    }
    if (content.length < 10) {
      this.errorMessage = '问题描述至少需要 10 个字';
      return;
    }
    if (email && !this.isValidEmail(email)) {
      this.errorMessage = '请输入有效的邮箱地址';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const selectedType = this.feedbackTypes.find(
        (type) => type.value === this.feedbackType
      );
      const result = await this.feedbackService.newFeedback({
        title,
        content,
        label: selectedType?.gatewayLabel ?? 'other',
        ...(email ? { email } : {}),
        ...(navigator.userAgent
          ? { userAgent: navigator.userAgent.slice(0, 1024) }
          : {}),
      });
      this.issueSyncFailed = !result.issueSynced;
      this.isDone = true;
      this.clearDraft();
    } catch (error) {
      console.warn('提交反馈失败:', error);
      this.errorMessage = '网络连接异常，请稍后重试';
    } finally {
      this.isSubmitting = false;
    }
  }

  returnToProfile(): void {
    void this.navController.navigateBack('/home?tab=profile');
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private loadDraft(): void {
    try {
      const savedDraft = localStorage.getItem(this.draftStorageKey);
      if (!savedDraft) return;

      const draft = JSON.parse(savedDraft) as Partial<FeedbackDraft>;
      if (
        typeof draft.feedbackType === 'string' &&
        this.feedbackTypes.some((type) => type.value === draft.feedbackType)
      ) {
        this.feedbackType = draft.feedbackType;
      }
      this.title = typeof draft.title === 'string' ? draft.title : '';
      this.content = typeof draft.content === 'string' ? draft.content : '';
      this.email = typeof draft.email === 'string' ? draft.email : '';
    } catch (error) {
      console.warn('加载反馈草稿失败:', error);
    }
  }

  private saveDraft(): void {
    try {
      const draft: FeedbackDraft = {
        feedbackType: this.feedbackType,
        title: this.title,
        content: this.content,
        email: this.email,
      };
      localStorage.setItem(this.draftStorageKey, JSON.stringify(draft));
    } catch (error) {
      console.warn('保存反馈草稿失败:', error);
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(this.draftStorageKey);
    } catch (error) {
      console.warn('清除反馈草稿失败:', error);
    }
  }
}
