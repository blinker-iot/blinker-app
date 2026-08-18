import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import { minuteToTime } from 'src/app/core/functions/func';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { Days2TextPipe } from 'src/app/core/pipes/days2text';
import { DataService } from 'src/app/core/services/data.service';
import {
  actionJson,
  CountdownTask,
  formatTimerDuration,
  isTaskRunning,
  LoopTask,
  loopTimes,
  normalizeRepeatDays,
  normalizeTaskCollection,
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

const TEST_COUNTDOWN_TASKS: CountdownTask[] = [
  {
    task: 0,
    run: 1,
    ttim: 45,
    rtim: 12,
    act: [{ switch: 'off' }],
    label: '45 分钟后关闭设备',
  },
  {
    task: 1,
    run: 0,
    ttim: 120,
    rtim: 0,
    act: [{ switch: 'on' }],
    label: '2 小时后开启设备',
  },
];

const TEST_LOOP_TASKS: LoopTask[] = [
  {
    task: 0,
    run: 1,
    tis: 6,
    tri: 2,
    dur1: 10,
    act1: [{ switch: 'on' }],
    dur2: 5,
    act2: [{ switch: 'off' }],
    label: '间歇运行演示',
  },
  {
    task: 1,
    run: 0,
    tis: 0,
    tri: 0,
    dur1: 30,
    act1: [{ switch: 'on' }],
    dur2: 15,
    act2: [{ switch: 'off' }],
    label: '无限循环演示',
  },
];

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

  get countdownTasks(): CountdownTask[] {
    return normalizeTaskCollection<CountdownTask>(this.device?.data?.countdown);
  }

  get loopTasks(): LoopTask[] {
    return normalizeTaskCollection<LoopTask>(this.device?.data?.loop);
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

    this.loopTasks.forEach((task, index) => {
      task.task ??= index;
      const times = loopTimes(task);
      timingItems.push({
        routeId: `loop-${index}`,
        type: 'loop',
        typeLabel: TIMER_TYPE_LABELS.loop,
        icon: 'fa-arrows-repeat',
        title: times ? `${times} 次循环` : '无限循环',
        schedule: `${formatTimerDuration(task.dur1)} · ${formatTimerDuration(task.dur2)}`,
        action: task.label || `${this.taskActionLabel(task.act1)} → ${this.taskActionLabel(task.act2)}`,
        enabled: isTaskRunning(task.run),
        source: task,
      });
    });

    this.countdownTasks.forEach((task, index) => {
      task.task ??= index;
      timingItems.push({
        routeId: `countdown-${index}`,
        type: 'countdown',
        typeLabel: TIMER_TYPE_LABELS.countdown,
        icon: 'fa-hourglass-clock',
        title: formatTimerDuration(task.ttim),
        schedule: this.countdownSchedule(task),
        action: this.taskActionLabel(task.act, task.label),
        enabled: isTaskRunning(task.run),
        source: task,
      });
    });

    return timingItems;
  }

  constructor(
    private readonly dataService: DataService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly timerService: TimerService,
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
    if (this.device.config?.isPreview) this.ensurePreviewTasks();

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
    if (!normalizeTaskCollection<CountdownTask>(this.device.data.countdown).length) {
      this.device.data.countdown = structuredClone(TEST_COUNTDOWN_TASKS);
    }
    if (!normalizeTaskCollection<LoopTask>(this.device.data.loop).length) {
      this.device.data.loop = structuredClone(TEST_LOOP_TASKS);
    }
  }
}
