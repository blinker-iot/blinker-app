import { historyEndInput, historyWindow, parseHistoryEnd, shiftHistoryWindow } from './history-window';

const now = Date.UTC(2026, 9, 20, 12, 30, 15), hour = 3600000;
describe('Fixed UTC history windows', () => {
  it('parses minute or second precision explicitly as UTC and round-trips seconds', () => {
    expect(parseHistoryEnd('2026-10-20T12:30')).toBe(now - 15000);
    expect(parseHistoryEnd('2026-10-20T12:30:15')).toBe(now);
    expect(historyEndInput(now)).toBe('2026-10-20T12:30:15');
    expect(parseHistoryEnd('2024-02-29T00:00')).toBe(Date.UTC(2024, 1, 29));
  });
  it.each(['', '2026-02-30T12:00', '2025-02-29T00:00', '2026-13-01T00:00', '2026-10-20T24:00',
    '2026-10-20T12:60', '2026-10-20T12:30:60', '1969-12-31T23:59:59', '2026-10-20T12:30Z',
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
