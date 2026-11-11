import type { DeviceUiValue } from './device-ui.port';

export interface HistoryPoint {
  at: number;
  value: DeviceUiValue;
}

const MAX_POINTS = 240;
const MAX_FIELDS = 32;

// Page-owned, bounded trend points only. Never persisted or used in place of
// the authenticated server State history. The host resets at scope boundaries.
export class EndpointHistory {
  private readonly series = new Map<string, HistoryPoint[]>();

  reset(): void { this.series.clear(); }

  points(key: string): readonly HistoryPoint[] {
    return this.series.get(key) ?? [];
  }

  // `onlyChanges` skips a reading equal to the previous one (state snapshots);
  // telemetry samples are always kept so flat periods stay visible.
  record(key: string, raw: DeviceUiValue | undefined, onlyChanges: boolean, at = Date.now()): void {
    const value = storable(raw);
    if (value === undefined || !Number.isFinite(at)
      || (!this.series.has(key) && this.series.size >= MAX_FIELDS)) return;

    const points = this.series.get(key) ?? [];
    const last = points[points.length - 1];
    if (last && (at <= last.at || (onlyChanges && last.value === value))) return;

    points.push({ at, value });
    const start = points.length - MAX_POINTS;
    this.series.set(key, start > 0 ? points.slice(start) : points);
  }
}

// Only JSON scalars are kept; bytes and structured values are not charted.
function storable(value: unknown): DeviceUiValue | undefined {
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || typeof value === 'string' || value === null) return value as DeviceUiValue;
  return undefined;
}
