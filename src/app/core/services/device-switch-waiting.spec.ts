import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeviceSwitchWaiting } from './device-switch-waiting';

describe('DeviceSwitchWaiting', () => {
  let waiting: DeviceSwitchWaiting;
  let device: { data: { switch: string } };
  let events: Array<{ value: unknown; source: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    waiting = new DeviceSwitchWaiting();
    device = { data: { switch: 'off' } };
    events = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses one timeout without interval polling and restores the old state', () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');

    waiting.begin(device, 'off', (value, source) => {
      events.push({ value, source });
    });

    expect(device.data.switch).toBe('waiting');
    expect(events.at(-1)?.source).toBe('local');
    expect(intervalSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(device.data.switch).toBe('off');
    expect(events.at(-1)?.source).toBe('switch-timeout');
  });

  it('cancels the fallback after device feedback', () => {
    waiting.begin(device, 'off', (value, source) => {
      events.push({ value, source });
    });
    waiting.complete(device);
    device.data.switch = 'on';

    vi.advanceTimersByTime(3000);

    expect(device.data.switch).toBe('on');
    expect(events.some((event) => event.source === 'switch-timeout')).toBe(
      false
    );
  });
});
