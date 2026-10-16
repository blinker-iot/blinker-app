import { Component, Inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular/standalone';
import { TaskDefinition, TaskRecord, TaskSchedule, taskDefinition } from '../../../../core/device-v2/tasks/contract';
import { TaskTarget, taskErrorText, taskValue } from '../device-timer.models';
import { TaskStatusComponent } from '../task-status.component';
import { TimerService } from '../timer.service';
import { NoticeService } from '../../../../core/services/notice.service';

function countdownMillis(seconds: number): number {
  const millis = Math.round(seconds * 1000);
  // Round-trip only an exact millisecond input, not a fractional millisecond.
  // Multiplication alone rejects valid decimals such as 1.001 seconds.
  if (typeof seconds !== 'number' || !Number.isInteger(millis) || millis < 1 || millis > 0x7fffffff
    || seconds !== millis / 1000) throw new Error('TASK_CONTRACT_INVALID');
  return millis;
}

@Component({
  selector: 'app-timing-edit', templateUrl: 'timing-edit.html', styleUrls: ['timing-edit.scss'],
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, FormsModule, TaskStatusComponent], providers: [TimerService],
})
export class TimingEditPage implements OnDestroy {
  id = ''; taskId?: number; invalidRoute = false;
  kind: TaskSchedule['kind'] = 'countdown';
  seconds = 1800; dateTime = ''; time = '08:00'; weekdays = 31;
  utcOffsetMinutes = 0 - new Date().getTimezoneOffset();
  key = ''; value: string | boolean = ''; enabled = true; revision = 0; error = '';
  readonly days = ['一', '二', '三', '四', '五', '六', '日'];
  private generation = 0;
  private record?: TaskRecord;
  private loaded = false;
  constructor(public readonly timer: TimerService, private readonly route: ActivatedRoute,
    private readonly nav: NavController, private readonly alerts: AlertController,
    @Inject(NoticeService) private readonly notices: NoticeService | null = null) {}
  get defaultBackHref(): string { return `/device-manager/${this.id}/timer`; }
  get target(): TaskTarget | undefined { return this.timer.targets.find(t => t.key === this.key); }
  get taskNotFound(): boolean { return this.invalidRoute || (this.timer.ready && this.taskId !== undefined
    && !this.timer.records.some(record => record.taskId === this.taskId)); }
  get formLoaded(): boolean { return this.loaded; }
  get canSave(): boolean {
    return this.timer.canWrite && this.formLoaded && !this.taskNotFound && !!this.target
      && (this.taskId !== undefined || this.timer.canCreate);
  }
  async ionViewWillEnter(): Promise<void> {
    const generation = ++this.generation;
    this.id = this.route.snapshot.paramMap.get('id') || '';
    const routeId = this.route.snapshot.paramMap.get('taskid') || '';
    const match = /^task-([1-9]\d*)$/.exec(routeId);
    this.taskId = match ? Number(match[1]) : undefined;
    this.invalidRoute = routeId !== 'new' && (!match || !Number.isSafeInteger(this.taskId) || this.taskId! > 0xffffffff);
    this.record = undefined; this.loaded = false; this.error = ''; this.key = ''; this.kind = 'countdown';
    this.seconds = 1800; this.value = ''; this.enabled = true;
    await this.timer.open(this.id);
    if (generation !== this.generation || !this.timer.ready) return;
    this.loadForm();
  }
  ionViewWillLeave(): void { ++this.generation; this.loaded = false; this.timer.close(); }
  ngOnDestroy(): void { this.ionViewWillLeave(); }
  loadForm(): void {
    if (!this.timer.ready || this.taskNotFound) return;
    this.revision = this.timer.revision;
    this.record = this.timer.records.find(record => record.taskId === this.taskId);
    this.loaded = true;
    if (this.taskId === undefined) { this.selectTarget(this.timer.targets[0]?.key || ''); return; }
    if (!this.record) return;
    const d = this.record.definition;
    this.kind = d.schedule.kind; this.key = d.key; this.enabled = d.enabled;
    this.value = typeof d.value === 'boolean' ? d.value : String(d.value);
    if (d.schedule.kind === 'countdown') this.seconds = d.schedule.durationMillis / 1000;
    if (d.schedule.kind === 'once') {
      const date = new Date(d.schedule.utcMillis);
      this.dateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
    }
    if (d.schedule.kind === 'weekly') {
      this.time = `${String(Math.floor(d.schedule.minuteOfDay / 60)).padStart(2, '0')}:${String(d.schedule.minuteOfDay % 60).padStart(2, '0')}`;
      this.weekdays = d.schedule.weekdays; this.utcOffsetMinutes = d.schedule.utcOffsetMinutes;
    }
  }
  selectTarget(key: string): void { this.key = key; this.value = this.target?.valueType === 'boolean' ? false : ''; }
  daySelected(index: number): boolean { return (this.weekdays & (1 << index)) !== 0; }
  toggleDay(index: number, checked: boolean): void {
    this.weekdays = checked ? this.weekdays | (1 << index) : this.weekdays & ~(1 << index);
  }
  definition(): TaskDefinition {
    const target = this.target; if (!target) throw new Error('TASK_TARGET_UNAVAILABLE');
    let schedule: TaskSchedule;
    if (this.kind === 'countdown') schedule = { kind: 'countdown', durationMillis: countdownMillis(this.seconds) };
    else if (this.kind === 'once') {
      const utcMillis = new Date(this.dateTime).getTime();
      if (!this.dateTime || !Number.isFinite(utcMillis) || utcMillis <= Date.now()) throw new Error('TASK_CONTRACT_INVALID');
      schedule = { kind: 'once', utcMillis };
    } else {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.time)
        || typeof this.utcOffsetMinutes !== 'number' || !Number.isInteger(this.utcOffsetMinutes))
        throw new Error('TASK_CONTRACT_INVALID');
      const [hour, minute] = this.time.split(':').map(Number);
      schedule = { kind: 'weekly', minuteOfDay: hour * 60 + minute, utcOffsetMinutes: this.utcOffsetMinutes, weekdays: this.weekdays };
    }
    return taskDefinition({ schedule, key: target.key, valueType: target.valueType, value: taskValue(target, this.value), enabled: this.enabled });
  }
  async save(): Promise<void> {
    if (!this.canSave) return;
    try {
      const definition = this.definition();
      const confirmed = await this.timer.write(this.taskId === undefined
        ? { operation: 'create', expectedRevision: this.revision, definition }
        : { operation: 'replace', expectedRevision: this.revision, taskId: this.taskId, definition }, false);
      if (confirmed) await this.returnConfirmed();
    } catch (error) { this.error = taskErrorText(error); }
  }
  async deleteTask(): Promise<void> {
    if (!this.timer.canWrite || !this.formLoaded || this.taskNotFound || !this.record) return;
    const generation = this.generation, taskId = this.record.taskId, revision = this.revision;
    const alert = await this.alerts.create({ header: '删除任务？', message: '删除定义不会撤销已经执行的属性赋值。',
      buttons: [{ text: '取消', role: 'cancel' }, { text: '删除', role: 'confirm' }] });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm' || generation !== this.generation) return;
    try {
      if (await this.timer.write({ operation: 'remove', expectedRevision: revision, taskId }, false))
        await this.returnConfirmed();
    } catch (error) { this.error = taskErrorText(error); }
  }
  private async returnConfirmed(): Promise<void> {
    // The editor leaves immediately after a verified response. Keep its exact
    // fresh/historical feedback visible while the list performs its own read.
    if (this.timer.notice) {
      try { void this.notices?.showToast(this.timer.notice, 3000).catch(() => undefined); }
      catch { /* Presentation failure cannot turn a confirmed write into unknown. */ }
    }
    await this.nav.navigateBack(this.defaultBackHref);
  }
}
