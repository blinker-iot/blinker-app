import {
  actionJson,
  countdownRunPayload,
  formatTimerDuration,
  loopRunPayload,
  loopTimes,
  normalizeRepeatDays,
  parseTimerAction,
} from './device-timer.models';

describe('device timer models', () => {
  it('normalizes legacy string and firmware array repeat days', () => {
    expect(normalizeRepeatDays('0111110')).toBe('0111110');
    expect(normalizeRepeatDays([1, 0, '1', 0, 1, 0, 1])).toBe('1010101');
    expect(normalizeRepeatDays('11')).toBe('1100000');
  });

  it('formats timer durations for compact task summaries', () => {
    expect(formatTimerDuration(0)).toBe('0 分钟');
    expect(formatTimerDuration(65)).toBe('1 小时 5 分钟');
    expect(formatTimerDuration(1500)).toBe('1 天 1 小时');
  });

  it('reads current and legacy loop-count fields', () => {
    expect(loopTimes({ run: 1, tis: 6, dur1: 1, act1: [], dur2: 1, act2: [] })).toBe(6);
    expect(loopTimes({ run: 1, tim: 9, dur1: 1, act1: [], dur2: 1, act2: [] })).toBe(9);
  });

  it('round-trips device action objects', () => {
    const action = { switch: 'on' };
    expect(actionJson(action)).toBe('{"switch":"on"}');
    expect(parseTimerAction('{"switch":"on"}')).toEqual(action);
  });

  it('uses null actions for firmware-compatible pause commands', () => {
    expect(countdownRunPayload(
      { run: 1, ttim: 30, rtim: 8, act: [{ switch: 'off' }] },
      false,
    )).toEqual({ run: 0, ttim: 30, rtim: 8, act: null });

    expect(loopRunPayload(
      { run: 1, tis: 4, dur1: 10, act1: [{ switch: 'on' }], dur2: 5, act2: [] },
      false,
    )).toMatchObject({ run: 0, act1: null, act2: null });
  });
});
