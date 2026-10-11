// Presentation only: these names never grant access or change a Manifest/command.
export interface CapabilityDisplayMetadata {
  key: string;
  kind: number;
  type: number;
  displayName?: string;
  trueLabel?: string;
  falseLabel?: string;
}
export interface DeviceDisplayMetadata {
  logicalDeviceId: string;
  revision: number;
  name: string;
  capabilities: CapabilityDisplayMetadata[];
}
export interface DisplayEndpoint { key: string; kind?: number; type?: number; }
export interface DeviceDisplaySource {
  name?: string;
  displayMetadata?: DeviceDisplayMetadata;
  config?: { customName?: string };
}
const encoder = new TextEncoder();

export function displayText(value: unknown, label = false): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw Error('DEVICE_V2_DISPLAY_INVALID');
  const text = value.trim();
  if (!text || text.length > (label ? 80 : 128) || encoder.encode(text).length > (label ? 320 : 256)
    || /[\u0000-\u001f\u007f-\u009f]/u.test(text) || !wellFormed(text)) {
    throw Error('DEVICE_V2_DISPLAY_INVALID');
  }
  return text;
}

export function parseDeviceDisplayMetadata(value: unknown, expectedId?: string): DeviceDisplayMetadata {
  const record = object(value);
  const id = record['logicalDeviceId'];
  if (typeof id !== 'string' || !id || id !== id.trim() || id.includes('\0') || id.length > 128
    || (expectedId !== undefined && id !== expectedId)
    || !Number.isSafeInteger(record['revision']) || Number(record['revision']) < 0
    || Number(record['revision']) > 0x7fffffff) throw Error('DEVICE_V2_DISPLAY_INVALID');
  exact(record, ['logicalDeviceId', 'revision', 'name', 'capabilities']);
  const name = displayText(record['name']);
  if (name !== record['name']) throw Error('DEVICE_V2_DISPLAY_INVALID');
  if (!Array.isArray(record['capabilities']) || record['capabilities'].length > 256) throw Error('DEVICE_V2_DISPLAY_INVALID');
  const seen = new Set<string>();
  const capabilities = record['capabilities'].map(input => {
    const item = object(input), key = item['key'], kind = item['kind'], type = item['type'];
    exact(item, ['key', 'kind', 'type', 'displayName', 'trueLabel', 'falseLabel']);
    if (typeof key !== 'string' || !key || encoder.encode(key).length > 64 || !wellFormed(key)
      || /[\u0000-\u001f\u007f-\u009f]/u.test(key) || seen.has(key)
      || !Number.isInteger(kind) || Number(kind) < 0 || Number(kind) > 2
      || !Number.isInteger(type) || Number(type) < 0 || Number(type) > 9) throw Error('DEVICE_V2_DISPLAY_INVALID');
    seen.add(key);
    const alias: CapabilityDisplayMetadata = { key, kind: Number(kind), type: Number(type) };
    for (const property of ['displayName', 'trueLabel', 'falseLabel'] as const) {
      if (item[property] === undefined) continue;
      const text = displayText(item[property], true);
      if (text !== item[property] || (property !== 'displayName' && type !== 0)) throw Error('DEVICE_V2_DISPLAY_INVALID');
      alias[property] = text;
    }
    return alias;
  });
  return { logicalDeviceId: id, revision: Number(record['revision']), name,
    capabilities: capabilities.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
}

export function deviceDisplayName(device: DeviceDisplaySource | undefined, fallback = '设备'): string {
  return device?.displayMetadata?.name?.trim() || device?.name?.trim() || device?.config?.customName?.trim() || fallback;
}
export function capabilityDisplayName(device: DeviceDisplaySource | undefined, endpoint: DisplayEndpoint): string {
  return compatibleAlias(device, endpoint)?.displayName || endpoint.key;
}
export function capabilityBooleanLabel(device: DeviceDisplaySource | undefined, endpoint: DisplayEndpoint, value: boolean): string {
  const alias = endpoint.type === 0 ? compatibleAlias(device, endpoint) : undefined;
  return (value ? alias?.trueLabel : alias?.falseLabel) || (value ? '开' : '关');
}
function compatibleAlias(device: DeviceDisplaySource | undefined, endpoint: DisplayEndpoint): CapabilityDisplayMetadata | undefined {
  return device?.displayMetadata?.capabilities.find(alias => alias.key === endpoint.key
    && alias.kind === endpoint.kind && alias.type === endpoint.type);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('DEVICE_V2_DISPLAY_INVALID');
  return value as Record<string, unknown>;
}
function exact(record: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(record).some(key => !allowed.includes(key))) throw Error('DEVICE_V2_DISPLAY_INVALID');
}
function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; ++i) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(++i);
      if (!Number.isInteger(low) || low < 0xdc00 || low > 0xdfff) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
