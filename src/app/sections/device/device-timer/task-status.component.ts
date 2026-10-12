import { Component, Input } from '@angular/core';
import { AlertController, IonicModule } from '@ionic/angular';
import { TimerService } from './timer.service';
import { taskOperationText } from './device-timer.models';

@Component({
  selector: 'app-task-status', imports: [IonicModule],
  template: `
    <section class="task-summary" aria-label="任务容量与来源">
      <strong class="capacity-text">{{ timer.capacityText }}</strong>
      <p class="source-text">{{ timer.sourceText }}</p>
    </section>
    @if (timer.busy) { <p role="status"><ion-spinner name="crescent" />正在等待设备确认/读取任务…</p> }
    @if (timer.error) { <p role="alert">{{ timer.error }}</p> }
    @if (error) { <p role="alert">{{ error }}</p> }
    @if (timer.notice) { <p role="status">{{ timer.notice }}</p> }
    @if (timer.ready) {
      <details class="task-query-details"><summary>查询与操作说明</summary>
        <p>当前查询修订 {{ timer.revision }}。设备有写入配额和开始冷却；被限流时稍后手动核对，不连续点击或自动重试。</p>
      </details>
    }
    @if (!timer.busy && !timer.ready) { <ion-button fill="outline" (click)="timer.refresh()">重新查询</ion-button> }
    @if (timer.canInitialize) { <ion-button (click)="initialize()">{{ timer.journal.authority ? '恢复原授权同步' : '启用/同步本机任务授权' }}</ion-button> }
    @if (timer.pending) {
      <section aria-label="未确认请求">
        <strong>尚未确认：{{ operationText(timer.pending.operation) }}</strong>
        <p>断线不代表未执行；原请求和日志已保留，不自动生成新请求。</p>
        @if (timer.journal.held) { <p>原操作已暂停重提。同步授权不证明原操作未执行；请查询核对后明确停止本地追踪，不会替你重新开始任务。</p> }
        @if (timer.journal.authority) { <p>任务授权同步尚未确认。恢复同步只使用原请求，不重提原操作。</p> }
        <p>查询只读取当前任务；恢复原请求可能执行原操作；停止本地追踪不会取消设备任务。</p>
        <details class="task-request-details"><summary>技术详情</summary>
          <p>原操作请求号：<code>{{ timer.pending.requestId }}</code></p>
          @if (timer.journal.authority) { <p>授权同步请求号：<code>{{ timer.journal.authority.requestId }}</code></p> }
        </details>
        <ion-button [disabled]="!timer.canRetry" (click)="retry()">恢复原请求</ion-button>
        <ion-button fill="outline" [disabled]="timer.busy" (click)="timer.refresh()">查询当前任务</ion-button>
        <ion-button fill="clear" [disabled]="!timer.canReviewPending" (click)="forget()">已核对，停止追踪原请求</ion-button>
      </section>
    }
  `,
  styles: ['p { overflow-wrap: anywhere; font-size: 12px; line-height: 1.6; } section { padding: 12px; border: 1px solid var(--blinker-border); border-radius: 12px; } .task-summary { margin-bottom: 12px; } .task-summary p { margin-bottom: 0; color: var(--blinker-text-secondary); } details { margin: 10px 0; font-size: 12px; color: var(--blinker-text-secondary); }'],
})
export class TaskStatusComponent {
  @Input({ required: true }) timer!: TimerService;
  error = '';
  readonly operationText = taskOperationText;
  constructor(private readonly alerts: AlertController) {}
  async initialize(): Promise<void> {
    if (!this.timer.canInitialize) return;
    const expected = JSON.stringify(this.timer.journal);
    const message = this.timer.pending
      ? '仅同步当前所有者的任务授权。保留并暂停重提原未确认操作，不能据此判断它是否执行；同步后需查询核对，不会自动重新开始任务。'
      : '将初始化或同步当前所有者的任务授权。任务由设备本地执行，退出 App 不会取消。';
    if (await this.confirm('启用/同步本机任务？', message) && expected === JSON.stringify(this.timer.journal))
      await this.timer.write({ operation: 'initialize' });
  }
  async retry(): Promise<void> {
    if (!this.timer.canRetry) return;
    if (await this.confirm('恢复原请求？', '使用原请求号和参数重新提交；如果原操作尚未执行，这次可能执行。仅查看现状请先查询当前任务。'))
      await this.timer.retry();
  }
  async forget(): Promise<void> {
    const expected = this.timer.journal;
    if (!expected.pending || !this.timer.canReviewPending) return;
    if (await this.confirm('仅停止追踪，不取消任务', '你已核对本次查询的任务表。原操作或授权同步可能已执行或仍在处理；只停止这两项的本地追踪，不撤销设备任务，也不自动重发。'))
      try { await this.timer.forget(expected); } catch { this.error = '未能停止追踪；原请求仍保留，请重新查询核对。'; }
  }
  private async confirm(header: string, message: string): Promise<boolean> {
    this.error = '';
    const generation = this.timer.generation;
    const alert = await this.alerts.create({ header, message,
      buttons: [{ text: '取消', role: 'cancel' }, { text: '确认', role: 'confirm' }] });
    await alert.present(); return (await alert.onDidDismiss()).role === 'confirm' && generation === this.timer.generation;
  }
}
