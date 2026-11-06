import { historyEndInput, historyLocalText, historyWindow, parseHistoryEnd, shiftHistoryWindow } from './history-window';

const now = Date.UTC(2026, 9, 20, 12, 30, 15), hour = 3600000;
describe('QA-2 phone-local history window boundaries', () => {
  it('QA-2 Shanghai formats a local cross-day end and converts it to the original UTC instant', () => {
    const at = Date.parse('2026-10-20T18:30:15Z');
    expect(new Date(at).getTimezoneOffset()).toBe(-480);
    expect(historyEndInput(at)).toBe('2026-10-21T02:30:15');
    expect(parseHistoryEnd('2026-10-21T02:30:15')).toBe(at);
    expect(parseHistoryEnd('2026-10-21T02:30')).toBe(at - 15000);
  });
  it('QA-2 New_York rejects skipped and repeated local times rather than silently picking an instant', () => {
    expect(new Date('2026-11-01T06:30:00Z').getTimezoneOffset()).toBe(300);
    expect(parseHistoryEnd('2026-03-08T02:30:00')).toBeUndefined();
    expect(parseHistoryEnd('2026-11-01T01:30:00')).toBeUndefined();
    expect(parseHistoryEnd('2026-11-01T02:30:00')).toBe(Date.parse('2026-11-01T07:30:00Z'));
  });
  it('QA-2 New_York preserves an unchanged applied second-fold UTC mapping and displays each offset', () => {
    const first = Date.parse('2026-11-01T05:30:00Z'), second = Date.parse('2026-11-01T06:30:00Z');
    expect(new Date(second).getTimezoneOffset()).toBe(300);
    expect(historyEndInput(first)).toBe('2026-11-01T01:30:00');
    expect(historyEndInput(second)).toBe('2026-11-01T01:30:00');
    expect(parseHistoryEnd(historyEndInput(second), second)).toBe(second);
    expect(historyLocalText(first)).toContain(' UTC-04:00'); expect(historyLocalText(second)).toContain(' UTC-05:00');
    const current = historyWindow(second, hour, second)!, previous = shiftHistoryWindow(current, -1, second)!;
    expect(previous.to).toBe(current.from); expect(shiftHistoryWindow(previous, 1, second)).toEqual(current);
  });
  it('QA-2 Lord_Howe rejects half-hour skipped and repeated local times', () => {
    expect(new Date('2026-04-04T15:15:00Z').getTimezoneOffset()).toBe(-630);
    expect(parseHistoryEnd('2026-04-05T01:45:00')).toBeUndefined();
    expect(parseHistoryEnd('2026-10-04T02:15:00')).toBeUndefined();
    expect(parseHistoryEnd('2026-04-05T02:15:00')).toBe(Date.parse('2026-04-04T15:45:00Z'));
  });
  it('QA-2 UTC retains UTC instants when the phone itself has zero offset', () => {
    expect(new Date(now).getTimezoneOffset()).toBe(0);
    expect(historyEndInput(now)).toBe('2026-10-20T12:30:15');
    expect(parseHistoryEnd('2026-10-20T12:30:15')).toBe(now);
    expect(historyLocalText(now)).toContain(' UTC+00:00');
    expect(parseHistoryEnd('2026-02-30T12:00')).toBeUndefined();
  });
});
describe('Phone-local input with fixed UTC history windows', () => {
  it('parses local minute or second precision and round-trips seconds without changing epoch queries', () => {
    const local = new Date(2026, 9, 20, 12, 30, 15).getTime();
    expect(parseHistoryEnd('2026-10-20T12:30')).toBe(local - 15000);
    expect(parseHistoryEnd('2026-10-20T12:30:15')).toBe(local);
    expect(historyEndInput(local)).toBe('2026-10-20T12:30:15');
    expect(parseHistoryEnd('2024-02-29T00:00')).toBe(new Date(2024, 1, 29).getTime());
  });
  it.each(['', '2026-02-30T12:00', '2025-02-29T00:00', '2026-13-01T00:00', '2026-10-20T24:00',
    '2026-10-20T12:60', '2026-10-20T12:30:60', '1900-12-31T23:59:59', '2026-10-20T12:30Z',
    '2026-10-20T12:30+08:00', '2026-10-20', '2026-10-20T12:30:15.123'])('rejects invalid or ambiguous date %s', value => {
    expect(parseHistoryEnd(value)).toBeUndefined();
  });
  it('forms adjacent half-open windows with no overlap/gap and reverses an earlier shift', () => {
    const current = historyWindow(now, hour, now)!, previous = shiftHistoryWindow(current, -1, now)!;
    expect(previous.to).toBe(current.from);
    expect(shiftHistoryWindow(previous, 1, now)).toEqual(current);
    for (const at of [previous.from, previous.to - 1, previous.to, current.to - 1, current.to]) {
      const matches = [previous, current].filter(w => at >= w.from && at < w.to);
      expect(matches).toHaveLength(at === current.to ? 0 : 1);
    }
  });
  it('rejects future/epoch/invalid widths instead of silently clamping or extending', () => {
    const current = historyWindow(now, hour, now)!;
    expect(shiftHistoryWindow(current, 1, now)).toBeUndefined();
    expect(shiftHistoryWindow({ from: 0, to: hour }, -1, now)).toBeUndefined();
    for (const [to, width] of [[now + 1000, hour], [hour - 1000, hour], [now, 0], [now, -1],
      [now, 31 * 86400000], [now + 1, hour], [now, 1001], [NaN, hour], [Infinity, hour]]) {
      expect(historyWindow(to, width, now)).toBeUndefined();
    }
    expect(historyWindow(now, 30 * 86400000, now)).toEqual({ from: now - 30 * 86400000, to: now });
  });
});
