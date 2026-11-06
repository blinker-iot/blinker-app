import { STATE_HISTORY_MAX_AGE_MS } from './state-history';

export interface HistoryWindow { from: number; to: number; }

// Only the input/display are local. Queries and half-open windows stay epoch ms.
// A repeated local hour has no unique instant; only an unchanged applied value
// may retain its already-known UTC mapping instead of silently choosing a fold.
export function parseHistoryEnd(value: string, appliedTo?: number): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return;
  const canonical = value.length === 16 ? value + ':00' : value;
  if (appliedTo !== undefined && Number.isSafeInteger(appliedTo) && appliedTo >= 0 && appliedTo % 1000 === 0
    && Number.isFinite(new Date(appliedTo).getTime()) && historyEndInput(appliedTo) === canonical) return appliedTo;
  const at = Date.parse(canonical);
  if (!Number.isSafeInteger(at) || at < 0 || historyEndInput(at) !== canonical) return;
  // At most three nearby offsets, not a minute/day scan. This also handles
  // half-hour transitions such as Lord Howe rather than assuming a 1h DST step.
  const day = 86400000, wall = Date.parse(canonical + 'Z');
  const offsets = new Set([at - day, at, at + day].map(time => new Date(time).getTimezoneOffset()));
  const candidates = [...offsets].map(offset => wall + offset * 60000)
    .filter(time => time >= 0 && historyEndInput(time) === canonical);
  if (candidates.length !== 1) return;
  return at;
}

export function historyEndInput(at: number): string {
  return new Date(at - new Date(at).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export function historyLocalText(at: number): string {
  const offset = -new Date(at).getTimezoneOffset(), absolute = Math.abs(offset);
  const text = new Date(at + offset * 60000).toISOString().slice(0, -1).replace('T', ' ');
  return `${text} UTC${offset < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

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
