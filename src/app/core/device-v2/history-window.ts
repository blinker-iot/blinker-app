import { STATE_HISTORY_MAX_AGE_MS } from './state-history';

export interface HistoryWindow { from: number; to: number; }

// The input is explicitly UTC, despite HTML's datetime-local control. Never let
// the host timezone/DST reinterpret it or normalize an invalid calendar date.
export function parseHistoryEnd(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return;
  const canonical = value.length === 16 ? value + ':00' : value;
  const at = Date.parse(canonical + 'Z');
  if (!Number.isSafeInteger(at) || at < 0 || new Date(at).toISOString().slice(0, 19) !== canonical) return;
  return at;
}

export function historyEndInput(at: number): string { return new Date(at).toISOString().slice(0, 19); }

export function historyWindow(to: number, width: number, now = Date.now()): HistoryWindow | undefined {
  if (!Number.isSafeInteger(to) || !Number.isSafeInteger(width) || width <= 0
    || width > STATE_HISTORY_MAX_AGE_MS || to % 1000 !== 0 || width % 1000 !== 0
    || to > now || to < width) return;
  return { from: to - width, to };
}

export function shiftHistoryWindow(window: HistoryWindow, direction: -1 | 1, now = Date.now()): HistoryWindow | undefined {
  const width = window.to - window.from;
  return historyWindow(window.to + direction * width, width, now);
}
