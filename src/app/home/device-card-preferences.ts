import { DeviceV2AccountScope, deviceV2AccountStoragePrefix } from '../core/device-v2/account-scope';

export type HomeCardLayout = 'standard' | 'wide';
export type HomeCardMode = 'read' | 'toggle' | 'action' | 'range';

export interface HomeCardBinding {
  key: string;
  kind: number;
  type: number;
  mode?: HomeCardMode;
}

export interface HomeCardPreferences {
  version: 3;
  revision: number;
  layouts: Record<string, HomeCardLayout>;
  orders: Record<string, string[]>;
  slots: Record<string, HomeCardBinding[]>;
}

export interface HomeCardPreferenceSnapshot {
  value: HomeCardPreferences;
  raw: string | null;
}

const PREFIX = 'blinker-v2-home-cards:';
const MAX_DEVICES = 512;
const MAX_VIEWS = 128;
const MAX_BYTES = 512 * 1024;
const MAX_REVISION = 0x7fffffff;
const encoder = new TextEncoder();
const invalid = () => Error('HOME_CARD_PREFERENCES_INVALID');

// Display preferences only. This store never writes device config or remote order.
export class HomeCardPreferencesStore {
  private readonly key: string;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    scope: DeviceV2AccountScope,
  ) {
    this.key = deviceV2AccountStoragePrefix(PREFIX, scope) + 'preferences';
  }

  load(): HomeCardPreferenceSnapshot {
    const raw = this.read();
    return { value: decode(raw), raw };
  }

  save(next: HomeCardPreferences, expectedRaw: string | null): HomeCardPreferenceSnapshot {
    const candidate = project(next);
    const currentRaw = this.read();
    if (currentRaw !== expectedRaw) throw Error('HOME_CARD_PREFERENCES_CONFLICT');
    // A caller cannot bypass corrupt/future-version protection by supplying its raw text.
    const current = decode(currentRaw);
    if (candidate.revision !== current.revision) throw Error('HOME_CARD_PREFERENCES_CONFLICT');
    if (current.revision === MAX_REVISION) throw Error('HOME_CARD_PREFERENCES_REVISION_EXHAUSTED');
    candidate.revision = current.revision + 1;
    const raw = JSON.stringify(candidate);
    boundedEncoding(raw);
    try { this.storage.setItem(this.key, raw); }
    catch { throw Error('HOME_CARD_PREFERENCES_WRITE_FAILED'); }
    return { value: candidate, raw };
  }

  private read(): string | null {
    try { return this.storage.getItem(this.key); }
    catch { throw Error('HOME_CARD_PREFERENCES_READ_FAILED'); }
  }
}

// Rooms currently have names, not stable IDs. Renaming a room creates a new view.
export function homeCardViewKey(roomName?: string): string {
  if (roomName === undefined) return 'all';
  text(roomName, 128);
  try { return 'room:' + encodeURIComponent(roomName); }
  catch { throw invalid(); }
}

// Saved IDs no longer visible are ignored. New visible IDs retain base order.
// Duplicate input IDs are deliberately collapsed; stored order duplicates are rejected.
export function orderedDeviceIds(baseIds: string[], saved?: readonly string[]): string[] {
  const base = ids(baseIds, false);
  const preferred = saved === undefined ? [] : ids(saved, false);
  const visible = new Set(base);
  const ordered = preferred.filter(id => visible.has(id));
  const included = new Set(ordered);
  return [...ordered, ...base.filter(id => !included.has(id))];
}

function decode(raw: string | null): HomeCardPreferences {
  if (raw === null) return { version: 3, revision: 0, layouts: Object.create(null), orders: Object.create(null), slots: Object.create(null) };
  boundedEncoding(raw);
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw invalid(); }
  return project(value, true);
}

function project(input: unknown, allowLegacy = false): HomeCardPreferences {
  const value = record(input);
  if (typeof value['version'] === 'number' && value['version'] > 3) {
    throw Error('HOME_CARD_PREFERENCES_UNSUPPORTED_VERSION');
  }
  const version = value['version'];
  const legacy = allowLegacy && (version === 1 || version === 2);
  const fields = version === 1 ? ['version', 'revision', 'layouts', 'orders'] : ['version', 'revision', 'layouts', 'orders', 'slots'];
  if ((version !== 3 && !legacy) || Object.keys(value).length !== fields.length
    || Object.keys(value).some(key => !fields.includes(key))
    || !Number.isSafeInteger(value['revision']) || Number(value['revision']) < 0
    || Number(value['revision']) > MAX_REVISION) throw invalid();
  const layouts = record(value['layouts']);
  const orders = record(value['orders']);
  const slots = version === 1 ? Object.create(null) as Record<string, unknown> : record(value['slots']);
  if (Object.keys(layouts).length > MAX_DEVICES || Object.keys(orders).length > MAX_VIEWS
    || Object.keys(slots).length > MAX_DEVICES) throw invalid();
  const result: HomeCardPreferences = { version: 3, revision: Number(value['revision']),
    layouts: Object.create(null), orders: Object.create(null), slots: Object.create(null) };
  const devices = new Set<string>();
  for (const [id, layout] of Object.entries(layouts)) {
    text(id, 128);
    if (layout !== 'standard' && layout !== 'wide') throw invalid();
    devices.add(id);
    result.layouts[id] = layout;
  }
  for (const [view, order] of Object.entries(orders)) {
    validView(view);
    const checked = ids(order, true);
    for (const id of checked) devices.add(id);
    if (devices.size > MAX_DEVICES) throw invalid();
    result.orders[view] = checked;
  }
  for (const [id, configured] of Object.entries(slots)) {
    text(id, 128);
    devices.add(id);
    if (devices.size > MAX_DEVICES) throw invalid();
    if (!Array.isArray(configured) || configured.length > 4) throw invalid();
    const seen = new Set<string>();
    let columns = 0;
    result.slots[id] = configured.map(input => {
      const binding = record(input);
      const hasMode = Object.hasOwn(binding, 'mode');
      if (Object.keys(binding).length !== (hasMode ? 4 : 3)
        || Object.keys(binding).some(key => !['key', 'kind', 'type', ...(version === 3 ? ['mode'] : [])].includes(key))) throw invalid();
      const key = binding['key'], kind = binding['kind'], type = binding['type'];
      const mode = hasMode ? binding['mode'] : 'read';
      text(key, 64);
      // Mode is explicit intent, not permission. Missing/read bindings never gain controls.
      const compatible = mode === 'read' ? kind === 0 && Number(type) >= 0 && Number(type) <= 5
        : mode === 'toggle' ? kind === 0 && type === 0
        : mode === 'action' ? kind === 1 && (type === 0 || type === 9)
        : mode === 'range' && kind === 0 && Number(type) >= 1 && Number(type) <= 4;
      if (encoder.encode(key).length > 64 || seen.has(key) || !compatible || !Number.isInteger(type)) throw invalid();
      seen.add(key);
      columns += mode === 'range' ? 2 : 1;
      if (columns > 4) throw invalid();
      // Omit explicit read in the canonical form; never persist span or command arguments.
      return { key, kind: Number(kind), type: Number(type), ...(mode === 'read' ? {} : { mode: mode as HomeCardMode }) };
    });
  }
  // Bounded legacy raw remains readable even if the v3 in-memory envelope adds
  // a few bytes. A subsequent save still enforces the complete v3 byte limit.
  if (!legacy) boundedEncoding(JSON.stringify(result));
  return result;
}

function ids(input: unknown, rejectDuplicates: boolean): string[] {
  if (!Array.isArray(input) || input.length > MAX_DEVICES) throw invalid();
  const seen = new Set<string>();
  for (const id of input) {
    text(id, 128);
    if (rejectDuplicates && seen.has(id)) throw invalid();
    seen.add(id);
  }
  return [...seen];
}

function validView(view: string): void {
  if (view === 'all') return;
  text(view, 2048);
  if (!view.startsWith('room:')) throw invalid();
  try {
    if (homeCardViewKey(decodeURIComponent(view.slice(5))) !== view) throw invalid();
  } catch { throw invalid(); }
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw invalid();
  return input as Record<string, unknown>;
}

function text(input: unknown, maximum: number): asserts input is string {
  if (typeof input !== 'string' || !input.trim() || input.length > maximum
    || /[\u0000-\u001f\u007f-\u009f]/u.test(input)) throw invalid();
  // URI encoding also rejects isolated surrogates, so view keys remain round-trippable.
  try { encodeURIComponent(input); } catch { throw invalid(); }
}

function boundedEncoding(raw: string): void {
  if (raw.length > MAX_BYTES || encoder.encode(raw).length > MAX_BYTES) throw invalid();
}
