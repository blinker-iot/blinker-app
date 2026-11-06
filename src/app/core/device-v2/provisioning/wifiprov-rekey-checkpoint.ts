import { validateDeviceV2AccountScope, type DeviceV2AccountScope } from '../account-scope';
import { base64UrlDecode } from '../base64url';
import { logicalDevicePeerId } from '../../protocol/device-v2';

export interface WiFiProvRekeyKeyContext {
  readonly credentialVersion: number;
  readonly locator: string;
}

export interface WiFiProvRekeyScope extends DeviceV2AccountScope {
  readonly region: 'China' | 'Global' | 'Development';
  readonly logicalDeviceId: string;
  readonly deviceInstanceId: string;
  readonly accessEpoch: number;
  readonly operationId: string;
  readonly previous: WiFiProvRekeyKeyContext;
}

const phases = ['prepared', 'prepare-dispatched', 'prepare-unknown', 'prepare-confirmed', 'issue-dispatched', 'issue-unknown',
  'issued', 'install-dispatched', 'install-unknown', 'installed',
  'commit-dispatched', 'commit-unknown', 'committed', 'wifi-dispatched', 'wifi-unknown', 'wifi-accepted', 'wifi-rejected'] as const;
type Phase = typeof phases[number];
type Step = 'prepare' | 'issue' | 'install' | 'commit' | 'wifi';

export interface WiFiProvRekeyCheckpoint {
  readonly version: 1;
  readonly scope: Readonly<WiFiProvRekeyScope>;
  readonly phase: Phase;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly next?: WiFiProvRekeyKeyContext;
  readonly wifiDispatchedAt?: number;
  readonly cloudConfirmedAt?: number;
}

/** Metadata supplied only by the authenticated response/readback adapter. */
type ScopeEvidence = { readonly scope: WiFiProvRekeyScope; readonly observedAt: number };
type Evidence = ScopeEvidence & { readonly next: WiFiProvRekeyKeyContext };

export type WiFiProvRekeyEvent =
  | { kind: 'prepared-confirmed'; source: 'response' | 'read-only'; evidence: ScopeEvidence }
  | { kind: 'issued'; source: 'response' | 'read-only'; evidence: Evidence }
  | { kind: 'dispatch' | 'unknown'; step: Step }
  | { kind: 'install-verified' | 'commit-verified'; source: 'response' | 'read-only'; evidence: Evidence }
  | { kind: 'wifi-receipt'; result: 'accepted' | 'rejected'; evidence: Evidence }
  | { kind: 'cloud-online'; evidence: Evidence & { issuedAt: number; stateUpdatedAt: number } };

const invalid = () => Error('WIFIPROV_REKEY_CHECKPOINT_INVALID');
const mismatch = () => Error('WIFIPROV_REKEY_CONTEXT_CHANGED');
const phaseConflict = () => Error('WIFIPROV_REKEY_PHASE_CONFLICT');
const time = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;
const version = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 0xffffffff;

function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw invalid();
  return value as Record<string, unknown>;
}

function id(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  try { base64UrlDecode(value, 16).fill(0); } catch { throw invalid(); }
  return value;
}

function keyContext(value: unknown): WiFiProvRekeyKeyContext {
  const item = record(value, ['credentialVersion', 'locator']);
  if (!version(item['credentialVersion'])) throw invalid();
  return Object.freeze({ credentialVersion: item['credentialVersion'], locator: id(item['locator']) });
}

function scopeOf(value: unknown): Readonly<WiFiProvRekeyScope> {
  const item = record(value, ['authority', 'accountId', 'region', 'logicalDeviceId', 'deviceInstanceId', 'accessEpoch', 'operationId', 'previous']);
  const { authority, accountId, region, logicalDeviceId, accessEpoch } = item;
  if (typeof authority !== 'string' || typeof accountId !== 'string' || typeof logicalDeviceId !== 'string'
    || (region !== 'China' && region !== 'Global' && region !== 'Development')
    || !logicalDeviceId.startsWith('device_') || !version(accessEpoch)) throw invalid();
  try { validateDeviceV2AccountScope({ authority, accountId }); logicalDevicePeerId(logicalDeviceId); }
  catch { throw invalid(); }
  const previous = keyContext(item['previous']);
  if (previous.credentialVersion === 0xffffffff) throw invalid();
  return Object.freeze({ authority, accountId, region, logicalDeviceId, accessEpoch, previous,
    deviceInstanceId: id(item['deviceInstanceId']), operationId: id(item['operationId']) });
}

const sameKey = (a: WiFiProvRekeyKeyContext, b: WiFiProvRekeyKeyContext) =>
  a.credentialVersion === b.credentialVersion && a.locator === b.locator;

function sameScope(a: Readonly<WiFiProvRekeyScope>, b: Readonly<WiFiProvRekeyScope>): boolean {
  return a.authority === b.authority && a.accountId === b.accountId && a.region === b.region && a.logicalDeviceId === b.logicalDeviceId
    && a.deviceInstanceId === b.deviceInstanceId && a.accessEpoch === b.accessEpoch && a.operationId === b.operationId
    && sameKey(a.previous, b.previous);
}

export function validateWiFiProvRekeyCheckpoint(value: unknown): WiFiProvRekeyCheckpoint {
  const item = record(value, ['version', 'scope', 'phase', 'createdAt', 'updatedAt'], ['next', 'wifiDispatchedAt', 'cloudConfirmedAt']);
  const { phase, createdAt, updatedAt, wifiDispatchedAt, cloudConfirmedAt } = item;
  if (item['version'] !== 1 || !phases.includes(phase as Phase) || !time(createdAt) || !time(updatedAt) || updatedAt < createdAt) throw invalid();
  const scope = scopeOf(item['scope']);
  const awaitingIssue = phase === 'prepared' || (phase as Phase).startsWith('prepare-') || (phase as Phase).startsWith('issue-');
  const next = awaitingIssue ? undefined : keyContext(item['next']);
  if ((awaitingIssue && Object.prototype.hasOwnProperty.call(item, 'next'))
    || (next && (next.credentialVersion !== scope.previous.credentialVersion + 1 || next.locator === scope.previous.locator))) throw invalid();
  const wifi = (phase as Phase).startsWith('wifi-');
  if (wifi ? !time(wifiDispatchedAt) || wifiDispatchedAt < createdAt || wifiDispatchedAt > updatedAt
    : Object.prototype.hasOwnProperty.call(item, 'wifiDispatchedAt')) throw invalid();
  if (Object.prototype.hasOwnProperty.call(item, 'cloudConfirmedAt')
    && (!wifi || phase === 'wifi-rejected' || !time(cloudConfirmedAt) || cloudConfirmedAt < (wifiDispatchedAt as number)
      || cloudConfirmedAt > updatedAt)) throw invalid();
  return Object.freeze({ version: 1, scope, phase: phase as Phase, createdAt, updatedAt,
    ...(next ? { next } : {}), ...(wifi ? { wifiDispatchedAt: wifiDispatchedAt as number } : {}),
    ...(time(cloudConfirmedAt) ? { cloudConfirmedAt } : {}) });
}

export function createWiFiProvRekeyCheckpoint(scope: WiFiProvRekeyScope, now: number): WiFiProvRekeyCheckpoint {
  return validateWiFiProvRekeyCheckpoint({ version: 1, scope, phase: 'prepared', createdAt: now, updatedAt: now });
}

export function assertWiFiProvRekeyCheckpointScope(value: unknown, expected: WiFiProvRekeyScope): WiFiProvRekeyCheckpoint {
  const current = validateWiFiProvRekeyCheckpoint(value);
  if (!sameScope(current.scope, scopeOf(expected))) throw mismatch();
  return current;
}

const beforeDispatch = { prepare: 'prepared', issue: 'prepare-confirmed', install: 'issued', commit: 'installed', wifi: 'committed' } as const;

/** Pure transition. The caller must CAS-persist a dispatch marker before I/O,
 * and independently enforce foreground, owner, permission and wire proof.
 * Reload may retain an unresolved marker; it cannot dispatch that step again. */
export function applyWiFiProvRekeyEvent(checkpoint: unknown, expected: WiFiProvRekeyScope,
  event: WiFiProvRekeyEvent, now: number): WiFiProvRekeyCheckpoint {
  const current = assertWiFiProvRekeyCheckpointScope(checkpoint, expected);
  if (!time(now) || now < current.updatedAt) throw invalid();
  const update = (patch: Partial<WiFiProvRekeyCheckpoint>) =>
    validateWiFiProvRekeyCheckpoint({ ...current, ...patch, updatedAt: now });
  const matchScopeEvidence = (value: ScopeEvidence, strictlyAfter = false) => {
    if (!value || !sameScope(current.scope, scopeOf(value.scope)) || !time(value.observedAt)
      || value.observedAt < current.updatedAt || (strictlyAfter && value.observedAt === current.updatedAt)
      || value.observedAt > now) throw mismatch();
  };
  const matchEvidence = (value: Evidence, strictlyAfter = false) => {
    matchScopeEvidence(value, strictlyAfter);
    const next = keyContext(value.next);
    if (current.next && !sameKey(next, current.next)) throw mismatch();
    return next;
  };
  switch (event.kind) {
    case 'prepared-confirmed':
      if (!['response', 'read-only'].includes(event.source) || (current.phase !== 'prepare-dispatched'
        && !(current.phase === 'prepare-unknown' && event.source === 'read-only'))) throw phaseConflict();
      matchScopeEvidence(event.evidence, current.phase === 'prepare-unknown');
      return update({ phase: 'prepare-confirmed' });
    case 'issued':
      if (!['response', 'read-only'].includes(event.source) || (current.phase !== 'issue-dispatched'
        && !(current.phase === 'issue-unknown' && event.source === 'read-only'))) throw phaseConflict();
      return update({ phase: 'issued', next: matchEvidence(event.evidence, current.phase === 'issue-unknown') });
    case 'dispatch':
      if (current.phase !== beforeDispatch[event.step]) throw phaseConflict();
      return update({ phase: `${event.step}-dispatched`, ...(event.step === 'wifi' ? { wifiDispatchedAt: now } : {}) });
    case 'unknown':
      if (current.phase !== `${event.step}-dispatched`) throw phaseConflict();
      return update({ phase: `${event.step}-unknown` });
    case 'install-verified': case 'commit-verified': {
      const step = event.kind === 'install-verified' ? 'install' : 'commit';
      if (!['response', 'read-only'].includes(event.source) || (current.phase !== `${step}-dispatched`
        && !(current.phase === `${step}-unknown` && event.source === 'read-only'))) throw phaseConflict();
      matchEvidence(event.evidence, current.phase === `${step}-unknown`);
      return update({ phase: step === 'install' ? 'installed' : 'committed' });
    }
    case 'wifi-receipt':
      if (current.phase !== 'wifi-dispatched' || !['accepted', 'rejected'].includes(event.result)
        || (event.result === 'rejected' && current.cloudConfirmedAt !== undefined)) throw phaseConflict();
      matchEvidence(event.evidence);
      return update({ phase: `wifi-${event.result}` });
    case 'cloud-online': {
      if (!['wifi-dispatched', 'wifi-unknown', 'wifi-accepted'].includes(current.phase)
        || current.cloudConfirmedAt !== undefined) throw phaseConflict();
      const { issuedAt, stateUpdatedAt, observedAt } = event.evidence;
      matchEvidence(event.evidence);
      if (!time(issuedAt) || !time(stateUpdatedAt) || issuedAt <= current.wifiDispatchedAt!
        || stateUpdatedAt < issuedAt || observedAt < stateUpdatedAt) throw mismatch();
      // A fresh matching cloud session never changes the original WiFi receipt.
      return update({ cloudConfirmedAt: observedAt });
    }
    default: throw phaseConflict();
  }
}
