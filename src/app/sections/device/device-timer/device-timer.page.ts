import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import { minuteToTime } from 'src/app/core/functions/func';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { Days2TextPipe } from 'src/app/core/pipes/days2text';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import {
  actionJson,
  CountdownTask,
  formatTimerDuration,
  isTaskRunning,
  isTimerObject,
  LoopTask,
  loopTimes,
  normalizeRepeatDays,
  TIMER_TYPE_LABELS,
  TimingTask,
  TimerTaskType,
} from './device-timer.models';
import { TimerService } from './timer.service';

interface TimerListItem {
  routeId: string;
  type: TimerTaskType;
  typeLabel: string;
  icon: string;
  title: string;
  schedule: string;
  action: string;
  enabled: boolean;
  source: TimingTask | CountdownTask | LoopTask;
}

const TEST_TIMING_TASKS: TimingTask[] = [
  {
    task: 0,
    ena: 1,
    tim: 450,
    act: [{ switch: 'on' }],
    day: '0111110',
    label: '工作日开启设备',
  },
  {
    task: 1,
    ena: 0,
    tim: 1320,
    act: [{ switch: 'off' }],
    day: '1111111',
    label: '每天关闭设备',
  },
];

const TEST_COUNTDOWN_TASK: CountdownTask = {
  run: 1,
  ttim: 45,
  rtim: 12,
  act: [{ switch: 'off' }],
  label: '45 分钟后关闭设备',
};

const TEST_LOOP_TASK: LoopTask = {
  run: 1,
  tis: 6,
  tri: 2,
  dur1: 10,
  act1: [{ switch: 'on' }],
  dur2: 5,
  act2: [{ switch: 'off' }],
  label: '间歇运行演示',
};

@Component({
  selector: 'app-device-timer',
  templateUrl: './device-timer.page.html',
  styleUrls: ['./device-timer.page.scss'],
  imports: [IonicModule, HeroCardComponent],
  providers: [TimerService],
})
export class DeviceTimerPage implements OnInit, OnDestroy {
  id = '';
  device?: BlinkerDevice;
  loaded = false;
  syncing = false;
  usingTestData = false;

  private readonly daysPipe = new Days2TextPipe();
  private subscription?: Subscription;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private initializedDeviceId = '';

  get defaultBackHref(): string {
    return `/device-manager/${this.id}`;
  }

  get deviceName(): string {
    return this.device?.config?.customName || '设备';
  }

  get timingTasks(): TimingTask[] {
    return Array.isArray(this.device?.data?.timing)
      ? (this.device.data.timing as TimingTask[])
      : [];
  }

  get countdownTask(): CountdownTask | undefined {
    const value: unknown = this.device?.data?.countdown;
    return isTimerObject<CountdownTask>(value) ? value : undefined;
  }

  get loopTask(): LoopTask | undefined {
    const value: unknown = this.device?.data?.loop;
    return isTimerObject<LoopTask>(value) ? value : undefined;
  }

  get timerItems(): TimerListItem[] {
    const timingItems = this.timingTasks.map((task, index): TimerListItem => ({
      routeId: `timing-${index}`,
      type: 'timing',
      typeLabel: TIMER_TYPE_LABELS.timing,
      icon: 'fa-calendar-clock',
      title: minuteToTime(Number(task.tim) || 0),
      schedule: String(this.daysPipe.transform(normalizeRepeatDays(task.day))),
      action: this.taskActionLabel(task.act, task.label),
      enabled: isTaskRunning(task.ena),
      source: task,
    }));

    if (this.loopTask) {
      const times = loopTimes(this.loopTask);
      timingItems.push({
        routeId: 'loop',
        type: 'loop',
        typeLabel: TIMER_TYPE_LABELS.loop,
        icon: 'fa-arrows-repeat',
        title: times ? `${times} 次循环` : '无限循环',
        schedule: `${formatTimerDuration(this.loopTask.dur1)} · ${formatTimerDuration(this.loopTask.dur2)}`,
        action: this.loopTask.label || `${this.taskActionLabel(this.loopTask.act1)} → ${this.taskActionLabel(this.loopTask.act2)}`,
        enabled: isTaskRunning(this.loopTask.run),
        source: this.loopTask,
      });
    }

    if (this.countdownTask) {
      timingItems.push({
        routeId: 'countdown',
        type: 'countdown',
        typeLabel: TIMER_TYPE_LABELS.countdown,
        icon: 'fa-hourglass-clock',
        title: formatTimerDuration(this.countdownTask.ttim),
        schedule: this.countdownSchedule(this.countdownTask),
        action: this.taskActionLabel(this.countdownTask.act, this.countdownTask.label),
        enabled: isTaskRunning(this.countdownTask.run),
        source: this.countdownTask,
      });
    }

    return timingItems;
  }

  get activeTaskCount(): number {
    return this.timerItems.filter((task) => task.enabled).length;
  }

  get typeSummary(): string {
    const singletonCount = Number(Boolean(this.loopTask)) + Number(Boolean(this.countdownTask));
    return `${this.timingTasks.length} 定时 · ${singletonCount} 专项`;
  }

  constructor(
    private readonly dataService: DataService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly timerService: TimerService,
    private readonly noticeService: NoticeService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.paramMap.get('id') || '';
    this.bindDevice();
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) this.bindDevice();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.syncTimer) clearTimeout(this.syncTimer);
  }

  refreshTasks(): void {
    if (!this.device || this.syncing) return;
    this.syncing = true;
    this.timerService.loadTask(this.device);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncing = false;
    }, 900);
  }

  addTask(): void {
    if (!this.device) return;
    if (this.timingTasks.length >= 20 && this.loopTask && this.countdownTask) {
      void this.noticeService.showToast('当前设备的三类任务均已达到数量上限');
      return;
    }
    void this.router.navigate([`/device-manager/${this.id}/timer/new`]);
  }

  editTask(item: TimerListItem): void {
    void this.router.navigate([`/device-manager/${this.id}/timer/${item.routeId}`]);
  }

  setTaskEnabled(item: TimerListItem, enabled: boolean): void {
    if (!this.device || item.enabled === enabled) return;
    const runValue = enabled ? 1 : 0;

    if (item.type === 'timing') {
      const task = item.source as TimingTask;
      task.ena = runValue;
      this.timerService.saveTiming(this.device, this.cleanTimingTask(task));
      return;
    }

    if (item.type === 'loop') {
      const task = item.source as LoopTask;
      task.run = runValue;
      this.timerService.setLoopRunning(
        this.device,
        this.cleanLoopTask(task),
        enabled,
      );
      return;
    }

    const task = item.source as CountdownTask;
    task.run = runValue;
    this.timerService.setCountdownRunning(
      this.device,
      this.cleanCountdownTask(task),
      enabled,
    );
  }

  private countdownSchedule(task: CountdownTask): string {
    const elapsed = Math.min(Number(task.rtim) || 0, Number(task.ttim) || 0);
    return isTaskRunning(task.run)
      ? `已运行 ${formatTimerDuration(elapsed)}`
      : '已暂停，可编辑后重新开始';
  }

  private taskActionLabel(actions: unknown, label?: string): string {
    if (label) return label;
    const action = Array.isArray(actions) ? actions[0] : undefined;
    if (!action) return '尚未设置执行动作';

    try {
      const layouter = this.device?.config?.layouter
        ? JSON.parse(this.device.config.layouter)
        : undefined;
      const matched = layouter?.actions?.find(
        (item: { cmd: unknown }) => JSON.stringify(item.cmd) === actionJson(action),
      );
      if (matched?.text) {
        return String(matched.text).replace(/(\?|？)name/g, this.deviceName);
      }
    } catch {
      // Fall through to a readable generic label for malformed legacy data.
    }

    const actionData = actionJson(action);
    if (actionData.includes('"switch":"on"')) return '开启设备';
    if (actionData.includes('"switch":"off"')) return '关闭设备';
    if (actionData.includes('"switch":"toggle"')) return '切换运行状态';
    return '执行设备动作';
  }

  private cleanTimingTask(task: TimingTask): TimingTask {
    const { label: _label, ...data } = task;
    return { ...data, day: normalizeRepeatDays(data.day) };
  }

  private cleanCountdownTask(task: CountdownTask): CountdownTask {
    const { label: _label, ...data } = task;
    return data;
  }

  private cleanLoopTask(task: LoopTask): LoopTask {
    const { label: _label, ...data } = task;
    return data;
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = Boolean(this.device);
    if (!this.device) return;

    this.device.data ||= {};
    this.usingTestData = Boolean(this.device.config?.isPreview);
    if (this.usingTestData) this.ensurePreviewTasks();

    if (this.initializedDeviceId !== this.id) {
      this.initializedDeviceId = this.id;
      this.timerService.loadTask(this.device);
    }
  }

  private ensurePreviewTasks(): void {
    if (!this.device) return;
    if (!Array.isArray(this.device.data.timing)) {
      this.device.data.timing = structuredClone(TEST_TIMING_TASKS);
    }
    if (!isTimerObject<CountdownTask>(this.device.data.countdown)) {
      this.device.data.countdown = structuredClone(TEST_COUNTDOWN_TASK);
    }
    if (!isTimerObject<LoopTask>(this.device.data.loop)) {
      this.device.data.loop = structuredClone(TEST_LOOP_TASK);
    }
  }
}
