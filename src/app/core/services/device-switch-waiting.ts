interface SwitchWaitingDevice {
  data: {
    switch?: unknown;
  };
}

type SwitchUpdate = (value: unknown, source: 'local' | 'switch-timeout') => void;

export class DeviceSwitchWaiting {
  private readonly timers = new WeakMap<SwitchWaitingDevice, number>();

  begin(
    device: SwitchWaitingDevice,
    previousState: unknown,
    update: SwitchUpdate
  ) {
    this.complete(device);
    device.data.switch = 'waiting';
    update('waiting', 'local');

    const timer = window.setTimeout(() => {
      this.timers.delete(device);
      if (device.data.switch !== 'waiting') return;
      device.data.switch = previousState;
      update(previousState, 'switch-timeout');
    }, 3000);
    this.timers.set(device, timer);
  }

  complete(device: SwitchWaitingDevice) {
    const timer = this.timers.get(device);
    if (typeof timer !== 'undefined') window.clearTimeout(timer);
    this.timers.delete(device);
  }
}
