import type { DeviceUiValue } from './device-ui.port';

export interface HistoryPoint {
  at: number;
  value: DeviceUiValue;
}

const MAX_POINTS = 240;
const MAX_AGE_MS = 48 * 3600_000;
const SAVE_DELAY_MS = 5000;

// Recent readings of one device, kept on this device only. Charts use it until
// Device V2 has server-side time series.
export class EndpointHistory {
  private readonly series = new Map<string, HistoryPoint[]>();
  private readonly storageKey?: string;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(logicalDeviceId?: string) {
    if (logicalDeviceId) {
      this.storageKey = `blinker-history:${logicalDeviceId}`;
      this.load();
    }
  }

  points(key: string): readonly HistoryPoint[] {
    return this.series.get(key) ?? [];
  }

  // `onlyChanges` skips a reading equal to the previous one (state snapshots);
  // telemetry samples are always kept so flat periods stay visible.
  record(key: string, raw: DeviceUiValue | undefined, onlyChanges: boolean, at = Date.now()): void {
    const value = storable(raw);
    if (value === undefined) return;

    const points = this.series.get(key) ?? [];
    const last = points[points.length - 1];
    if (last && (at <= last.at || (onlyChanges && last.value === value))) return;

    points.push({ at, value });
    const oldest = at - MAX_AGE_MS;
    const start = Math.max(points.length - MAX_POINTS, points.findIndex(point => point.at >= oldest));
    this.series.set(key, start > 0 ? points.slice(start) : points);
    this.scheduleSave();
  }

  flush(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.storageKey) return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(
        [...this.series].map(([key, points]) => [key, points.map(point => [point.at, point.value])]),
      )));
    } catch {
      // History is a convenience; a full or blocked storage only loses it.
    }
  }

  private scheduleSave(): void {
    if (this.storageKey && !this.saveTimer) this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  private load(): void {
    if (!this.storageKey) return;

    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}') as Record<string, unknown>;
      const oldest = Date.now() - MAX_AGE_MS;
      for (const [key, entries] of Object.entries(stored)) {
        if (!Array.isArray(entries)) continue;
        const points = entries.flatMap(entry => {
          const value = Array.isArray(entry) ? storable(entry[1]) : undefined;
          return value !== undefined && typeof entry[0] === 'number' && entry[0] >= oldest ? [{ at: entry[0], value }] : [];
        });
        if (points.length) this.series.set(key, points.slice(-MAX_POINTS));
      }
    } catch {
      this.series.clear();
    }
  }
}

// Only JSON scalars are kept; bytes and structured values are not charted.
function storable(value: unknown): DeviceUiValue | undefined {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || typeof value === 'string' || value === null) return value as DeviceUiValue;
  return undefined;
}
