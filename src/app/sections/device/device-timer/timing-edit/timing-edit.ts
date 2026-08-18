import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, ModalController, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import {
  TabSelectorComponent,
  TabSelectorOption,
} from 'src/app/core/components/tab-selector/tab-selector.component';
import { minuteToTime, timeToMinute } from 'src/app/core/functions/func';
import { RepeatSelectorModalComponent } from 'src/app/core/modals/repeat-selector-modal/repeat-selector-modal.component';
import { TimeSelectorModalComponent } from 'src/app/core/modals/time-selector-modal/time-selector-modal.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { Days2TextPipe } from 'src/app/core/pipes/days2text';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import {
  actionJson,
  CountdownTask,
  formatTimerDuration,
  isTaskRunning,
  LoopTask,
  loopTimes,
  normalizeRepeatDays,
  normalizeTaskCollection,
  parseTimerAction,
  TIMER_TYPE_LABELS,
  TimingTask,
  TimerAction,
  TimerTaskType,
} from '../device-timer.models';
import { TimerService } from '../timer.service';

interface ActionOption {
  text: string;
  cmd: Record<string, unknown>;
  icon: string;
}

type ActionTarget = 'primary' | 'secondary';

@Component({
  selector: 'app-timing-edit',
  templateUrl: 'timing-edit.html',
  styleUrls: ['timing-edit.scss'],
  imports: [
    IonicModule,
    FormsModule,
    Days2TextPipe,
    HeroCardComponent,
    TabSelectorComponent,
  ],
  providers: [TimerService],
})
export class TimingEditPage implements OnInit, OnDestroy {
  id = '';
  taskId = 'new';
  device?: BlinkerDevice;
  mode: 'new' | 'edit' = 'new';
  selectedType: TimerTaskType = 'timing';
  activeActionTarget: ActionTarget = 'primary';
  loaded = false;
  saving = false;
  taskNotFound = false;
  timeInfo = '08:00';
  startImmediately = true;

  countdownHours = 0;
  countdownMinutes = 30;
  loopCycles = 0;
  loopPhase1Minutes = 10;
  loopPhase2Minutes = 5;

  timingData: TimingTask = this.createNewTimingTask(0);
  countdownData: CountdownTask = this.createNewCountdownTask();
  loopData: LoopTask = this.createNewLoopTask();

  private subscription?: Subscription;
  private initializedKey = '';

  get defaultBackHref(): string {
    return `/device-manager/${this.id}/timer`;
  }

  get deviceName(): string {
    return this.device?.config?.customName || '设备';
  }

  get usingTestData(): boolean {
    return Boolean(this.device?.config?.isPreview);
  }

  get pageTitle(): string {
    return `${this.mode === 'new' ? '新建' : '编辑'}${TIMER_TYPE_LABELS[this.selectedType]}`;
  }

  get heroTitle(): string {
    return `${this.mode === 'new' ? '创建' : '编辑'}${TIMER_TYPE_LABELS[this.selectedType]}`;
  }

  get editorDescription(): string {
    if (this.selectedType === 'loop') {
      return `${this.deviceName} 将按两个阶段交替执行动作。`;
    }
    if (this.selectedType === 'countdown') {
      return `${this.deviceName} 将在倒计时结束后执行一次动作。`;
    }
    return `${this.deviceName} 将在指定时间和日期执行动作。`;
  }

  get editorIcon(): string {
    if (this.selectedType === 'loop') return 'fa-light fa-arrows-repeat';
    if (this.selectedType === 'countdown') return 'fa-light fa-hourglass-clock';
    return 'fa-light fa-calendar-clock';
  }

  get countdownDuration(): number {
    const total = this.clampNumber(this.countdownHours, 0, 68) * 60
      + this.clampNumber(this.countdownMinutes, 0, 59);
    return Math.min(4095, total);
  }

  get countdownDurationText(): string {
    return formatTimerDuration(this.countdownDuration);
  }

  get loopCycleText(): string {
    const cycles = this.clampNumber(this.loopCycles, 0, 100);
    return cycles ? `执行 ${cycles} 次后停止` : '持续循环，直到手动停止';
  }

  get actionOptions(): readonly ActionOption[] {
    try {
      const layouter = this.device?.config?.layouter
        ? JSON.parse(this.device.config.layouter)
        : undefined;
      const actions = Array.isArray(layouter?.actions) ? layouter.actions : [];
      if (actions.length) {
        return actions
          .filter((action: { cmd?: unknown }) => action?.cmd && typeof action.cmd === 'object')
          .map((action: { text?: unknown; cmd: Record<string, unknown> }) => ({
            text: String(action.text || '执行设备动作').replace(/(\?|？)name/g, this.deviceName),
            cmd: action.cmd,
            icon: 'fa-bolt',
          }));
      }
    } catch {
      // Use the safe fallback actions below for malformed legacy layouts.
    }

    return [
      { text: '开启设备', cmd: { switch: 'on' }, icon: 'fa-power-off' },
      { text: '关闭设备', cmd: { switch: 'off' }, icon: 'fa-power-off' },
      { text: '切换运行状态', cmd: { switch: 'toggle' }, icon: 'fa-toggle-on' },
    ];
  }

  get selectedActionText(): string {
    return this.actionText(this.primaryActions[0]);
  }

  get secondaryActionText(): string {
    return this.actionText(this.loopData.act2[0]);
  }

  get activeActionText(): string {
    return this.activeActionTarget === 'secondary'
      ? this.secondaryActionText
      : this.selectedActionText;
  }

  get isSaveDisabled(): boolean {
    if (this.saving || this.taskNotFound) return true;
    if (this.selectedType === 'loop') {
      return this.loopPhase1Minutes < 1
        || this.loopPhase2Minutes < 1
        || !this.loopData.act1.length
        || !this.loopData.act2.length;
    }
    if (this.selectedType === 'countdown') {
      return this.countdownDuration < 1 || !this.countdownData.act.length;
    }
    return !this.timingData.act.length;
  }

  get taskTypeTabs(): readonly TabSelectorOption[] {
    return [
      {
        value: 'timing',
        label: TIMER_TYPE_LABELS.timing,
        icon: 'fa-light fa-calendar-clock',
        disabled: !this.canSelectType('timing'),
      },
      {
        value: 'loop',
        label: TIMER_TYPE_LABELS.loop,
        icon: 'fa-light fa-arrows-repeat',
        disabled: !this.canSelectType('loop'),
      },
      {
        value: 'countdown',
        label: TIMER_TYPE_LABELS.countdown,
        icon: 'fa-light fa-hourglass-clock',
        disabled: !this.canSelectType('countdown'),
      },
    ];
  }

  private get primaryActions(): TimerAction[] {
    if (this.selectedType === 'loop') return this.loopData.act1;
    if (this.selectedType === 'countdown') return this.countdownData.act;
    return this.timingData.act;
  }

  constructor(
    private readonly timerService: TimerService,
    private readonly noticeService: NoticeService,
    private readonly modalController: ModalController,
    private readonly dataService: DataService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly navController: NavController,
  ) {}

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.paramMap.get('id') || '';
    this.taskId = this.activatedRoute.snapshot.paramMap.get('taskid') || 'new';
    this.bindDevice();
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) this.bindDevice();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  canSelectType(type: TimerTaskType): boolean {
    if (this.mode === 'edit') return this.selectedType === type;
    if (type === 'timing') return this.ensureTimingTasks().length < 20;
    if (type === 'loop') return this.ensureLoopTasks().length < 20;
    return this.ensureCountdownTasks().length < 20;
  }

  selectTaskType(type: TimerTaskType): void {
    if (!this.canSelectType(type)) return;
    this.selectedType = type;
    this.activeActionTarget = 'primary';
  }

  selectTaskTypeValue(type: string): void {
    if (type === 'timing' || type === 'loop' || type === 'countdown') {
      this.selectTaskType(type);
    }
  }

  selectActionTarget(target: ActionTarget): void {
    this.activeActionTarget = target;
  }

  selectAction(option: ActionOption): void {
    const value = JSON.stringify(option.cmd);
    if (this.selectedType === 'loop') {
      if (this.activeActionTarget === 'secondary') this.loopData.act2 = [value];
      else this.loopData.act1 = [value];
      return;
    }
    if (this.selectedType === 'countdown') {
      this.countdownData.act = [value];
      return;
    }
    this.timingData.act = [value];
  }

  isActionSelected(option: ActionOption): boolean {
    const actions = this.selectedType === 'loop' && this.activeActionTarget === 'secondary'
      ? this.loopData.act2
      : this.primaryActions;
    return actionJson(actions[0]) === JSON.stringify(option.cmd);
  }

  async save(): Promise<void> {
    if (!this.device || this.isSaveDisabled) return;

    this.saving = true;
    try {
      if (this.selectedType === 'timing') this.saveTimingTask();
      else if (this.selectedType === 'countdown') this.saveCountdownTask();
      else this.saveLoopTask();

      await this.noticeService.showToast(`${TIMER_TYPE_LABELS[this.selectedType]}已保存`);
      await this.navController.navigateBack(this.defaultBackHref);
    } catch (error) {
      console.error('Failed to save timer task', error);
      await this.noticeService.showToast('任务保存失败，请检查时间和执行动作');
    } finally {
      this.saving = false;
    }
  }

  async deleteTask(): Promise<void> {
    if (!this.device || this.mode !== 'edit' || this.saving) return;

    this.saving = true;
    try {
      const taskIndex = this.selectedType === 'timing'
        ? this.timingTaskIndex
        : this.taskIndexFor(this.selectedType);
      const tasks = this.selectedType === 'timing'
        ? this.ensureTimingTasks()
        : this.selectedType === 'loop'
          ? this.ensureLoopTasks()
          : this.ensureCountdownTasks();
      const task = tasks[taskIndex];
      if (taskIndex < 0 || !task) return;
      this.timerService.deleteTask(this.device, this.selectedType, task.task ?? taskIndex);
      tasks.splice(taskIndex, 1);
      tasks.forEach((item, index) => {
        item.task = index;
      });

      await this.noticeService.showToast(`${TIMER_TYPE_LABELS[this.selectedType]}已删除`);
      await this.navController.navigateBack(this.defaultBackHref);
    } finally {
      this.saving = false;
    }
  }

  backToList(): void {
    void this.navController.navigateBack(this.defaultBackHref);
  }

  async openTimeModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: TimeSelectorModalComponent,
      componentProps: { data: this.timeInfo },
    });
    await modal.present();
    const result = await modal.onDidDismiss<string>();
    if (result.data) this.timeInfo = result.data;
  }

  async openRepeatModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: RepeatSelectorModalComponent,
      componentProps: { data: normalizeRepeatDays(this.timingData.day) },
    });
    await modal.present();
    const result = await modal.onDidDismiss<string>();
    if (result.data) this.timingData.day = normalizeRepeatDays(result.data);
  }

  private get timingTaskIndex(): number {
    const match = this.taskId.match(/^timing-(\d+)$/);
    const value = match ? Number(match[1]) : Number(this.taskId);
    return Number.isInteger(value) ? value : -1;
  }

  private taskIndexFor(type: 'loop' | 'countdown'): number {
    if (this.taskId === type) return 0;
    const match = this.taskId.match(new RegExp(`^${type}-(\\d+)$`));
    return match ? Number(match[1]) : -1;
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = Boolean(this.device);
    if (!this.device) return;

    this.device.data ||= {};
    const key = `${this.id}:${this.taskId}`;
    if (this.initializedKey === key) return;
    this.initializedKey = key;

    if (this.taskId === 'new') {
      this.mode = 'new';
      this.selectedType = this.firstAvailableType();
      this.timingData = this.createNewTimingTask(this.ensureTimingTasks().length);
      return;
    }

    this.mode = 'edit';
    if (this.taskId === 'loop' || this.taskId.startsWith('loop-')) this.loadLoopTask();
    else if (this.taskId === 'countdown' || this.taskId.startsWith('countdown-')) {
      this.loadCountdownTask();
    }
    else this.loadTimingTask();
  }

  private firstAvailableType(): TimerTaskType {
    if (this.ensureTimingTasks().length < 20) return 'timing';
    if (this.ensureLoopTasks().length < 20) return 'loop';
    return 'countdown';
  }

  private loadTimingTask(): void {
    this.selectedType = 'timing';
    const source = this.ensureTimingTasks()[this.timingTaskIndex];
    if (!source) {
      this.taskNotFound = true;
      return;
    }
    this.timingData = {
      ...source,
      day: normalizeRepeatDays(source.day),
      act: this.cloneActions(source.act),
    };
    this.timeInfo = minuteToTime(Number(this.timingData.tim) || 0);
  }

  private loadCountdownTask(): void {
    this.selectedType = 'countdown';
    const source = this.ensureCountdownTasks()[this.taskIndexFor('countdown')];
    if (!source) {
      this.taskNotFound = true;
      return;
    }
    this.countdownData = { ...source, act: this.cloneActions(source.act) };
    const total = this.clampNumber(source.ttim, 1, 4095);
    this.countdownHours = Math.floor(total / 60);
    this.countdownMinutes = total % 60;
    this.startImmediately = isTaskRunning(source.run);
  }

  private loadLoopTask(): void {
    this.selectedType = 'loop';
    const source = this.ensureLoopTasks()[this.taskIndexFor('loop')];
    if (!source) {
      this.taskNotFound = true;
      return;
    }
    this.loopData = {
      ...source,
      act1: this.cloneActions(source.act1),
      act2: this.cloneActions(source.act2),
    };
    this.loopCycles = loopTimes(source);
    this.loopPhase1Minutes = this.clampNumber(source.dur1, 1, 2047);
    this.loopPhase2Minutes = this.clampNumber(source.dur2, 1, 2047);
    this.startImmediately = isTaskRunning(source.run);
  }

  private saveTimingTask(): void {
    if (!this.device) return;
    const tasks = this.ensureTimingTasks();
    const taskIndex = this.mode === 'edit' ? this.timingTaskIndex : tasks.length;
    const uploadTask: TimingTask = {
      task: this.mode === 'edit' ? Number(this.timingData.task) : tasks.length,
      ena: this.timingData.ena,
      tim: timeToMinute(this.timeInfo),
      day: normalizeRepeatDays(this.timingData.day),
      act: this.timingData.act.map((action) => parseTimerAction(action)),
    };
    this.timerService.saveTiming(this.device, uploadTask);
    if (this.mode === 'edit') tasks[taskIndex] = uploadTask;
    else tasks.push(uploadTask);
  }

  private saveCountdownTask(): void {
    if (!this.device) return;
    const tasks = this.ensureCountdownTasks();
    const taskIndex = this.mode === 'edit' ? this.taskIndexFor('countdown') : tasks.length;
    const uploadTask: CountdownTask = {
      task: this.mode === 'edit' ? this.countdownData.task ?? taskIndex : tasks.length,
      run: this.startImmediately ? 1 : 0,
      ttim: this.clampNumber(this.countdownDuration, 1, 4095),
      rtim: 0,
      act: this.countdownData.act.map((action) => parseTimerAction(action)),
    };
    this.timerService.saveCountdown(this.device, uploadTask);
    if (this.mode === 'edit') tasks[taskIndex] = uploadTask;
    else tasks.push(uploadTask);
  }

  private saveLoopTask(): void {
    if (!this.device) return;
    const tasks = this.ensureLoopTasks();
    const taskIndex = this.mode === 'edit' ? this.taskIndexFor('loop') : tasks.length;
    const cycles = this.clampNumber(this.loopCycles, 0, 100);
    const uploadTask: LoopTask = {
      task: this.mode === 'edit' ? this.loopData.task ?? taskIndex : tasks.length,
      run: this.startImmediately ? 1 : 0,
      tis: cycles,
      tim: cycles,
      tri: 0,
      dur1: this.clampNumber(this.loopPhase1Minutes, 1, 2047),
      act1: this.loopData.act1.map((action) => parseTimerAction(action)),
      dur2: this.clampNumber(this.loopPhase2Minutes, 1, 2047),
      act2: this.loopData.act2.map((action) => parseTimerAction(action)),
    };
    this.timerService.saveLoop(this.device, uploadTask);
    if (this.mode === 'edit') tasks[taskIndex] = uploadTask;
    else tasks.push(uploadTask);
  }

  private ensureTimingTasks(): TimingTask[] {
    if (!this.device) return [];
    if (!Array.isArray(this.device.data.timing)) this.device.data.timing = [];
    return this.device.data.timing as TimingTask[];
  }

  private ensureCountdownTasks(): CountdownTask[] {
    if (!this.device) return [];
    if (!Array.isArray(this.device.data.countdown)) {
      this.device.data.countdown = normalizeTaskCollection<CountdownTask>(
        this.device.data.countdown,
      );
    }
    return this.device.data.countdown as CountdownTask[];
  }

  private ensureLoopTasks(): LoopTask[] {
    if (!this.device) return [];
    if (!Array.isArray(this.device.data.loop)) {
      this.device.data.loop = normalizeTaskCollection<LoopTask>(this.device.data.loop);
    }
    return this.device.data.loop as LoopTask[];
  }

  private createNewTimingTask(task: number): TimingTask {
    return { task, ena: 1, tim: 480, act: [], day: '0000000' };
  }

  private createNewCountdownTask(): CountdownTask {
    return { task: 0, run: 1, ttim: 30, rtim: 0, act: [] };
  }

  private createNewLoopTask(): LoopTask {
    return {
      task: 0,
      run: 1,
      tis: 0,
      tim: 0,
      tri: 0,
      dur1: 10,
      act1: [],
      dur2: 5,
      act2: [],
    };
  }

  private cloneActions(actions: TimerAction[] | undefined): TimerAction[] {
    return Array.isArray(actions) ? actions.map((action) => actionJson(action)) : [];
  }

  private actionText(action: TimerAction | undefined): string {
    if (!action) return '请选择执行动作';
    const selectedJson = actionJson(action);
    return this.actionOptions.find((option) => JSON.stringify(option.cmd) === selectedJson)?.text
      || '执行设备动作';
  }

  private clampNumber(value: unknown, min: number, max: number): number {
    const numberValue = Math.floor(Number(value));
    if (!Number.isFinite(numberValue)) return min;
    return Math.min(max, Math.max(min, numberValue));
  }
}
