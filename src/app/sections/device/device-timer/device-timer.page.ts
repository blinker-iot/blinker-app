import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { HeroCardComponent } from '../../../core/components/hero-card/hero-card.component';
import { TaskRecord } from '../../../core/device-v2/tasks/contract';
import { taskProgressText, taskScheduleText } from './device-timer.models';
import { TaskStatusComponent } from './task-status.component';
import { TimerService } from './timer.service';

@Component({
  selector: 'app-device-timer', templateUrl: './device-timer.page.html', styleUrls: ['./device-timer.page.scss'],
  imports: [IonicModule, HeroCardComponent, TaskStatusComponent], providers: [TimerService],
})
export class DeviceTimerPage implements OnDestroy {
  id = '';
  readonly scheduleText = taskScheduleText;
  readonly progressText = taskProgressText;
  constructor(public readonly timer: TimerService, private readonly route: ActivatedRoute,
    private readonly router: Router, private readonly alerts: AlertController) {}
  get defaultBackHref(): string { return `/device-manager/${this.id}`; }
  ionViewWillEnter(): void { this.id = this.route.snapshot.paramMap.get('id') || ''; void this.timer.open(this.id); }
  ionViewWillLeave(): void { this.timer.close(); }
  ngOnDestroy(): void { this.timer.close(); }
  addTask(): void {
    if (this.timer.canCreate)
      void this.router.navigate([`/device-manager/${this.id}/timer/new`]);
  }
  editTask(record: TaskRecord): void {
    if (this.timer.ready && !this.timer.busy) void this.router.navigate([`/device-manager/${this.id}/timer/task-${record.taskId}`]);
  }
  async change(record: TaskRecord, operation: 'start' | 'enable'): Promise<void> {
    if (!this.timer.canWrite) return;
    if (operation === 'start' && (record.definition.schedule.kind !== 'countdown' || !record.definition.enabled
      || record.progress === 1 || record.progress === 2)) return;
    const revision = this.timer.revision, taskId = record.taskId, enabled = !record.definition.enabled, generation = this.timer.generation;
    const alert = await this.alerts.create({ header: operation === 'start' ? '开始新的倒计时？' : enabled ? '启用任务？' : '停用任务？',
      message: operation === 'start' ? '将从现在重新计时。重启后中止，不自动续跑。' : '启用不等于开始或恢复倒计时。停用不撤销已执行的动作。',
      buttons: [{ text: '取消', role: 'cancel' }, { text: '确认', role: 'confirm' }] });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm' || generation !== this.timer.generation || !this.timer.canWrite || this.timer.revision !== revision) return;
    await this.timer.write(operation === 'start' ? { operation, expectedRevision: revision, taskId }
      : { operation, expectedRevision: revision, taskId, enabled });
  }
}
