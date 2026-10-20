import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceUiEndpoint, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { capabilityBooleanLabel, capabilityDisplayName } from '../../../core/device-v2/display-metadata';
import { compactNumber } from '../../../device/v2/widgets/widget-kit';
import { deviceUiRange } from '../../../core/device-v2/endpoint-control';
import type { HomeCardBinding, HomeCardMode } from '../../device-card-preferences';

export interface DeviceCardMetric {
  key: string;
  label: string;
  display: string;
  unit: string;
  description: string;
  unavailable: string | null;
  binding: HomeCardBinding;
  mode: HomeCardMode;
  span: 1 | 2;
  field?: DeviceUiEndpoint;
}

// Match the footer's 12px insets, 1px border, 6px gap and max(44px, 3rem) tile.
// Measurement changes presentation only, never the saved layout or bindings.
export function deviceCardColumns(width: number, wide: boolean, minimum = 48): number {
  if (!Number.isFinite(width) || width <= 0) return wide ? 4 : 2;
  const tileWidth = Number.isFinite(minimum) ? Math.max(44, minimum) : 48;
  return Math.max(1, Math.min(4, Math.floor((width - 20) / (tileWidth + 6))));
}

export function deviceCardRangeFits(width: number, columns: number): boolean {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(columns) || columns < 2 || columns > 4) return false;
  const track = (width - 26 - (columns - 1) * 6) / columns;
  return track * 2 + 6 >= 140;
}

export function homeCardSpan(binding: HomeCardBinding): 1 | 2 { return binding.mode === 'range' ? 2 : 1; }

export function homeCardRow(metrics: readonly DeviceCardMetric[], columns: number,
  rangeFits = true, legacyExtra = false): { visible: DeviceCardMetric[]; hasMore: boolean } {
  const capacity = Number.isFinite(columns) ? Math.max(1, Math.min(4, Math.floor(columns))) : 1;
  const fits = (metric: DeviceCardMetric) => metric.mode !== 'range' || rangeFits;
  if (!legacyExtra && metrics.every(fits) && metrics.reduce((sum, metric) => sum + metric.span, 0) <= capacity) {
    return { visible: [...metrics], hasMore: false };
  }
  const visible: DeviceCardMetric[] = [];
  let used = 0;
  for (const metric of metrics) {
    if (!fits(metric) || used + metric.span > capacity - 1) break;
    visible.push(metric); used += metric.span;
  }
  return { visible, hasMore: true };
}

// This is a projection of the already cached/accepted Manifest, never a discovery demand.
export function homeCardReadableFields(snapshot: DeviceUiSnapshot | undefined): DeviceUiEndpoint[] {
  return homeCardFields(snapshot, 'read');
}

export function homeCardFields(snapshot: DeviceUiSnapshot | undefined, mode: HomeCardMode): DeviceUiEndpoint[] {
  if (!hasManifest(snapshot)) return [];
  const counts = new Map<string, number>();
  for (const field of snapshot!.endpoints) counts.set(field.key, (counts.get(field.key) ?? 0) + 1);
  return snapshot!.endpoints.filter(field => counts.get(field.key) === 1 && eligible(field, mode));
}

export function homeCardBindingField(snapshot: DeviceUiSnapshot | undefined, binding: HomeCardBinding): DeviceUiEndpoint | undefined {
  return homeCardFields(snapshot, binding.mode ?? 'read').find(field => field.key === binding.key
    && field.manifestKind === binding.kind && field.manifestType === binding.type);
}

// Import is explicit at the editor boundary; reading a legacy row never persists it.
// An unresolved or oversized legacy row must not silently become an empty/truncated draft.
export function legacyCardBindings(device: BlinkerDevice | undefined,
  snapshot: DeviceUiSnapshot | undefined): HomeCardBinding[] | undefined {
  const configured = device?.config.card?.metrics;
  if (!Array.isArray(configured) || configured.length > 4) return undefined;
  if (!configured.length) return [];
  if (!hasManifest(snapshot)) return undefined;
  const fields = homeCardReadableFields(snapshot);
  const result: HomeCardBinding[] = [];
  const seen = new Set<string>();
  for (const binding of configured) {
    if (!validKey(binding?.key)) return undefined;
    if (seen.has(binding.key)) continue;
    const field = fields.find(field => field.key === binding.key);
    if (!field) return undefined;
    seen.add(binding.key);
    result.push({ key: field.key, kind: field.manifestKind!, type: field.manifestType! });
  }
  return result;
}

export function deviceCardMetrics(device: BlinkerDevice | undefined, snapshot: DeviceUiSnapshot | undefined,
  bindings?: readonly HomeCardBinding[]): DeviceCardMetric[] {
  const configured = bindings ?? device?.config.card?.metrics;
  if (!Array.isArray(configured)) return [];

  const seen = new Set<string>();
  return configured.slice(0, 4).flatMap(binding => {
    const key = binding?.key;
    if (!validKey(key) || seen.has(key)) return [];
    seen.add(key);

    const fields = hasManifest(snapshot) ? snapshot!.endpoints.filter(field => field.key === key) : [];
    const candidate = fields.length === 1 ? fields[0] : undefined;
    const full = bindings === undefined ? undefined : binding as HomeCardBinding;
    const mode = full?.mode ?? 'read';
    const unavailable = !hasManifest(snapshot) ? '尚未获取设备能力'
      : !candidate ? '字段已移除或无法确认'
      : full && (full.kind !== candidate.manifestKind || full.type !== candidate.manifestType) ? '字段类型已变化'
      : !eligible(candidate, mode) ? '字段不再符合所选显示或控制模式' : null;
    const field = unavailable ? undefined : candidate;
    const endpoint = full ?? { key, kind: field?.manifestKind, type: field?.manifestType };
    const label = capabilityDisplayName(device, endpoint);
    const value = mode !== 'action' && field && scalarValue(field) ? field.value : undefined;
    const numeric = typeof value === 'bigint' || typeof value === 'number' && Number.isFinite(value);
    const unit = numeric || typeof value === 'string' ? field?.unit ?? '' : '';
    const display = mode === 'action' && !unavailable ? '执行'
      : typeof value === 'boolean' ? capabilityBooleanLabel(device, endpoint, value)
      : typeof value === 'string' ? value
      : numeric ? (value > -1000 && value < 1000 ? String(value) : compactNumber(value)) : '—';
    const fullValue = numeric ? String(value) : display;
    // -1 is an unresolved, display-only legacy type, never a command or persisted migration.
    const reference: HomeCardBinding = full ?? { key, kind: candidate?.manifestKind ?? 0, type: candidate?.manifestType ?? -1 };
    return [{ key, label, display, unit, unavailable, binding: reference, mode, span: homeCardSpan(reference), field,
      description: unavailable ? `${label}：不可用，${unavailable}` : `${label}：${fullValue}${unit}` }];
  });
}

function eligible(field: DeviceUiEndpoint, mode: HomeCardMode): boolean {
  if (!validKey(field.key)) return false;
  if (mode === 'read') return readableScalar(field);
  if (mode === 'toggle') return readableScalar(field) && field.writable && field.manifestType === 0;
  if (mode === 'action') return field.role === 'action' && field.manifestKind === 1 && field.writable
    && (field.manifestType === 0 && field.valueType === 'boolean' || field.manifestType === 9 && field.valueType === 'null');
  return mode === 'range' && readableScalar(field) && !!deviceUiRange(field);
}

function hasManifest(snapshot: DeviceUiSnapshot | undefined): boolean {
  return snapshot?.manifestAccepted === true && Number.isSafeInteger(snapshot.manifestRevision)
    && snapshot.manifestRevision! >= 0 && typeof snapshot.manifestFingerprint === 'string'
    && snapshot.manifestFingerprint.length > 0 && Array.isArray(snapshot.endpoints);
}

function validKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && !/[\u0000-\u001f\u007f]/u.test(key)
    && new TextEncoder().encode(key).length <= 64;
}

function readableScalar(field: DeviceUiEndpoint): boolean {
  const expected = ['boolean', 'integer', 'integer', 'number', 'number', 'text'];
  return validKey(field.key) && field.role === 'property' && field.readable === true
    && field.manifestKind === 0 && Number.isInteger(field.manifestType)
    && field.manifestType! >= 0 && field.manifestType! <= 5
    && field.valueType === expected[field.manifestType!];
}

function scalarValue(field: DeviceUiEndpoint): boolean {
  const value = field.value;
  switch (field.manifestType) {
    case 0: return typeof value === 'boolean';
    case 1: return typeof value === 'bigint' || typeof value === 'number' && Number.isSafeInteger(value);
    case 2: return (typeof value === 'bigint' && value >= 0n)
      || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    case 3:
    case 4: return typeof value === 'number' && Number.isFinite(value);
    case 5: return typeof value === 'string';
    default: return false;
  }
}
