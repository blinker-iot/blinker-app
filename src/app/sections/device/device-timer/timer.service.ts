import { Injectable, OnDestroy } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import {
  countdownRunPayload,
  CountdownTask,
  isTaskRunning,
  loopRunPayload,
  LoopTask,
  TimingTask,
  TimerTaskType,
} from './device-timer.models';

@Injectable()
export class TimerService implements OnDestroy {
  private readonly requestTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly deviceService: DeviceService,
  ) { }

  loadTask(device?: BlinkerDevice): void {
    if (!device || device.config?.isPreview) return;

    this.clearRequestTimers();
    // DeviceService merges MQTT messages for a short period, so the three
    // requests are spaced out to keep every `get` command intact.
    (['timing', 'loop', 'countdown'] as const).forEach((type, index) => {
      const timer = setTimeout(() => {
        try {
          this.deviceService.sendData(device, JSON.stringify({ get: type }));
        } catch (error) {
          console.error(`Failed to request ${type} task`, error);
        }
      }, index * 160);
      this.requestTimers.push(timer);
    });
  }

  saveTiming(device: BlinkerDevice, task: TimingTask): void {
    this.sendSet(device, 'timing', [task]);
  }

  saveCountdown(device: BlinkerDevice, task: CountdownTask): void {
    if (isTaskRunning(task.run)) {
      this.sendSet(device, 'countdown', [task]);
      return;
    }

    // Firmware only accepts a null action when pausing. Configure the task
    // first, then pause it after DeviceService has flushed the first command.
    this.sendSet(device, 'countdown', [countdownRunPayload(task, true)]);
    setTimeout(() => this.setCountdownRunning(device, task, false), 160);
  }

  saveLoop(device: BlinkerDevice, task: LoopTask): void {
    if (isTaskRunning(task.run)) {
      this.sendSet(device, 'loop', [task]);
      return;
    }

    this.sendSet(device, 'loop', [loopRunPayload(task, true)]);
    setTimeout(() => this.setLoopRunning(device, task, false), 160);
  }

  setCountdownRunning(device: BlinkerDevice, task: CountdownTask, running: boolean): void {
    this.sendSet(device, 'countdown', [countdownRunPayload(task, running)]);
  }

  setLoopRunning(device: BlinkerDevice, task: LoopTask, running: boolean): void {
    this.sendSet(device, 'loop', [loopRunPayload(task, running)]);
  }

  deleteTask(device: BlinkerDevice, type: TimerTaskType, taskId?: number): void {
    this.sendSet(device, type, [{ dlt: taskId }]);
  }

  ngOnDestroy(): void {
    this.clearRequestTimers();
  }

  private sendSet(device: BlinkerDevice, type: TimerTaskType, value: unknown): void {
    if (device.config?.isPreview) return;
    this.deviceService.sendData(device, JSON.stringify({ set: { [type]: value } }));
  }

  private clearRequestTimers(): void {
    this.requestTimers.splice(0).forEach((timer) => clearTimeout(timer));
  }
}
