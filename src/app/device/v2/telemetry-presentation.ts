import type {
  DeviceUiTransport,
  DeviceUiValue,
} from '../../core/device-v2/device-ui.port';

export const TELEMETRY_CHART_MAX_POINTS = 300;
export const TELEMETRY_PRESENTATION_MAX_FIELDS = 32;

export interface TelemetryPresentationSnapshot {
  readonly active: boolean;
  readonly effectiveIntervalMs: number;
  readonly source: DeviceUiTransport;
  readonly streamId: number;
  readonly epoch: number;
  readonly sampleSequence?: number;
  readonly sampleMonotonicMs?: number;
  readonly receivedMonotonicMs?: number;
  readonly missedSamples: number;
  readonly values: Readonly<Record<string, DeviceUiValue | undefined>>;
}

/** X is local monotonic arrival time, not a fabricated UTC/history timestamp. */
export interface TelemetryChartPoint {
  readonly receivedMonotonicMs: number;
  readonly value: number;
  readonly breakBefore: boolean;
}

export type TelemetryFreshness = 'waiting' | 'fresh' | 'stale' | 'stopped';

export interface TelemetryFieldPresentation {
  readonly value?: DeviceUiValue;
  readonly status: TelemetryFreshness;
  readonly ageMs: number | null;
  readonly effectiveIntervalMs: number;
  readonly source?: DeviceUiTransport;
  readonly missedSamples: number;
  readonly points: readonly TelemetryChartPoint[];
}

interface FieldSamples {
  value?: DeviceUiValue;
  receivedMonotonicMs?: number;
  points: readonly TelemetryChartPoint[];
  breakBeforeNext: boolean;
}

function curveValue(value: DeviceUiValue | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : undefined;
  }
  return undefined;
}

function finiteTimestamp(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function freshnessLimitMs(intervalMs: number): number {
  return Math.max(5000, 3 * intervalMs);
}

/** Page-owned, bounded telemetry only. It never mutates normal State. */
export class TelemetryPresentation {
  private readonly fields = new Map<string, FieldSamples>();
  private identity = '';
  private sequence?: number;
  private lastArrivalMs?: number;
  private active = false;
  private intervalMs = 0;
  private source?: DeviceUiTransport;
  private missedSamples = 0;

  reset(): void {
    this.fields.clear();
    this.identity = '';
    this.sequence = undefined;
    this.lastArrivalMs = undefined;
    this.active = false;
    this.intervalMs = 0;
    this.source = undefined;
    this.missedSamples = 0;
  }

  update(snapshot: TelemetryPresentationSnapshot): void {
    const identity = `${snapshot.source}:${snapshot.streamId}:${snapshot.epoch}`;
    if (identity !== this.identity) {
      this.reset();
      this.identity = identity;
    }
    this.active = snapshot.active;
    this.source = snapshot.source;
    this.intervalMs = Number.isFinite(snapshot.effectiveIntervalMs)
      ? Math.max(0, snapshot.effectiveIntervalMs) : 0;
    this.missedSamples = Number.isSafeInteger(snapshot.missedSamples)
      ? Math.max(0, snapshot.missedSamples) : 0;

    const sequence = snapshot.sampleSequence;
    const arrival = snapshot.receivedMonotonicMs;
    if (!snapshot.active || typeof sequence !== 'number' || !Number.isInteger(sequence)
      || sequence <= 0 || sequence > 0xffffffff || !finiteTimestamp(arrival)) return;
    // Sequence zero is reserved, so max -> 1 is adjacent, not a lost sample.
    const delta = this.sequence === undefined ? 1 : sequence >= this.sequence
      ? sequence - this.sequence : 0xffffffff - this.sequence + sequence;
    // Status renewals repeat the sample identity. They do not refresh its age.
    if (delta === 0 || delta >= 0x80000000) return;
    // A local clock reversal is not a new valid time axis.
    if (this.lastArrivalMs !== undefined && arrival < this.lastArrivalMs) return;
    const sampleGap = delta > 1 || this.lastArrivalMs !== undefined
      && arrival - this.lastArrivalMs >= freshnessLimitMs(this.intervalMs);
    this.sequence = sequence;
    this.lastArrivalMs = arrival;

    // Omitted or invalid measurements are gaps, never zero or interpolated data.
    for (const [key, field] of this.fields) {
      if (sampleGap || !Object.prototype.hasOwnProperty.call(snapshot.values, key)
        || curveValue(snapshot.values[key]) === undefined) field.breakBeforeNext = true;
    }
    for (const [key, rawValue] of Object.entries(snapshot.values)) {
      let field = this.fields.get(key);
      if (!field) {
        if (this.fields.size >= TELEMETRY_PRESENTATION_MAX_FIELDS) continue;
        field = { points: [], breakBeforeNext: false };
        this.fields.set(key, field);
      }
      // Do not present a malformed floating point sample as a fresh measurement.
      if (rawValue === undefined || typeof rawValue === 'number' && !Number.isFinite(rawValue)) {
        field.breakBeforeNext = true;
        continue;
      }
      field.value = rawValue instanceof Uint8Array ? new Uint8Array(rawValue) : rawValue;
      field.receivedMonotonicMs = arrival;
      const numeric = curveValue(rawValue);
      if (numeric === undefined) {
        field.breakBeforeNext = true;
        continue;
      }
      field.points = [...field.points.slice(-(TELEMETRY_CHART_MAX_POINTS - 1)), {
        receivedMonotonicMs: arrival,
        value: numeric,
        breakBefore: field.breakBeforeNext || sampleGap,
      }];
      field.breakBeforeNext = false;
    }
  }

  field(key: string, nowMonotonicMs: number): TelemetryFieldPresentation {
    const field = this.fields.get(key);
    const ageMs = field?.receivedMonotonicMs !== undefined && finiteTimestamp(nowMonotonicMs)
      ? Math.max(0, nowMonotonicMs - field.receivedMonotonicMs) : null;
    return {
      value: !this.active ? undefined : field?.value instanceof Uint8Array
        ? new Uint8Array(field.value) : field?.value,
      status: !this.active ? 'stopped' : ageMs === null ? 'waiting'
        : ageMs >= freshnessLimitMs(this.intervalMs) ? 'stale' : 'fresh',
      ageMs,
      effectiveIntervalMs: this.intervalMs,
      source: this.source,
      missedSamples: this.missedSamples,
      points: field?.points ?? [],
    };
  }
}

export function telemetrySourceLabel(source?: DeviceUiTransport): string {
  return source === 'cloud' ? '云端 MQTT' : source === 'ble' ? '蓝牙直连'
    : source === 'lan' ? '局域网直连' : '';
}

export function telemetryIntervalLabel(intervalMs: number): string {
  return Number.isFinite(intervalMs) && intervalMs > 0
    ? `实际 ${(intervalMs / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 秒/次`
    : '等待确认采样间隔';
}

export function telemetryFreshnessLabel(field: TelemetryFieldPresentation): string {
  if (field.status === 'waiting') return '等待首次数据';
  if (field.status === 'stopped') return '实时已停止';
  const age = field.ageMs === null || field.ageMs < 1000 ? '刚刚更新'
    : `${Math.floor(field.ageMs / 1000)} 秒前更新`;
  return field.status === 'stale' ? `数据陈旧 · ${age}` : age;
}
