import { base64UrlDecode, base64UrlEncode } from '../base64url';
import type { WiFiProvRekeyScope } from './wifiprov-rekey-checkpoint';
import type { WiFiProvRekeyGateway, WiFiProvRekeyServerState } from './wifiprov-rekey-coordinator';

const ENDPOINT = '/api/v2/internal/wifiprov-rekey/';
const CONTRACT = 'wifiprov-rekey-v1';
const MAX_RESPONSE = 4096;
type Action = 'prepare' | 'issue' | 'confirm' | 'read';
type Fields = Record<string, unknown>;
export interface WiFiProvRekeySession { readonly accountId: string; readonly region: string; readonly token: string }

const coded = (code: string) => Object.assign(Error(code), { code });
const invalid = () => coded('WIFIPROV_REKEY_RESPONSE_INVALID');
const unavailable = () => coded('WIFIPROV_REKEY_GATEWAY_UNAVAILABLE');
const STATES = ['prepared', 'key_issued', 'committed', 'expired'];

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Fields {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw invalid();
  return value as Fields;
}

function binary(value: unknown, size: number): Uint8Array {
  if (typeof value !== 'string' || value.length !== Math.ceil(size * 8 / 6)) throw invalid();
  try { return base64UrlDecode(value, size); } catch { throw invalid(); }
}

function id(value: unknown, size = 16): string {
  binary(value, size).fill(0);
  return value as string;
}

function checkedMac(mac: Uint8Array): string {
  if (!(mac instanceof Uint8Array) || mac.length !== 32 || !mac.some(Boolean)) throw coded('WIFIPROV_REKEY_REQUEST_INVALID');
  return base64UrlEncode(mac);
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let received = 0, output = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return JSON.parse(output + decoder.decode());
      received += part.value.byteLength;
      if (received > MAX_RESPONSE) throw invalid();
      output += decoder.decode(part.value, { stream: true });
    }
  } catch { void reader.cancel().catch(() => undefined); throw invalid(); }
  finally { reader.releaseLock(); }
}

function readState(value: unknown, scope: WiFiProvRekeyScope, action: Action) {
  const expectedExtra = action === 'prepare' ? ['binding'] : action === 'issue' ? ['transfer'] : action === 'confirm' ? ['wifiPermit'] : [];
  const fields = object(value, ['logicalDeviceId', 'operationId', 'state', 'fromVersion', 'toVersion', ...expectedExtra],
    ['newLocator', 'prepareExpiresAt', 'issuedAt', 'committedAt', ...(action === 'prepare' ? [] : ['binding'])]);
  const { state, operationId, logicalDeviceId, fromVersion, toVersion, newLocator } = fields;
  if (logicalDeviceId !== scope.logicalDeviceId || operationId !== scope.operationId
    || fromVersion !== scope.previous.credentialVersion || toVersion !== scope.previous.credentialVersion + 1
    || typeof state !== 'string' || !STATES.includes(state)
    || (action !== 'read' && state !== ({ prepare: 'prepared', issue: 'key_issued', confirm: 'committed' } as const)[action])) throw invalid();
  const common: WiFiProvRekeyServerState = { logicalDeviceId: scope.logicalDeviceId, operationId: scope.operationId,
    state: state as WiFiProvRekeyServerState['state'], fromVersion: scope.previous.credentialVersion, toVersion: scope.previous.credentialVersion + 1,
    ...(newLocator !== undefined ? { newLocator: id(newLocator) } : {}) };
  if ((state === 'key_issued' || state === 'committed') !== (common.newLocator !== undefined)
    || common.newLocator === scope.previous.locator) throw invalid();
  for (const field of ['prepareExpiresAt', 'issuedAt', 'committedAt']) {
    if (fields[field] !== undefined && (!Number.isSafeInteger(fields[field]) || Number(fields[field]) <= 0)) throw invalid();
  }
  const binding = fields['binding'];
  if ((action === 'prepare' || (action === 'read' && state !== 'expired')) && binding === undefined) throw invalid();
  if (binding === undefined) return { common, fields };
  const old = object(binding, ['operationId', 'challenge', 'instance', 'accessEpoch', 'fromVersion', 'oldLocator']);
  if (old['operationId'] !== operationId || old['instance'] !== scope.deviceInstanceId || old['accessEpoch'] !== scope.accessEpoch
    || old['fromVersion'] !== fromVersion || old['oldLocator'] !== scope.previous.locator) throw invalid();
  return { common: { ...common, binding: { operationId: scope.operationId, instance: scope.deviceInstanceId,
    accessEpoch: scope.accessEpoch, fromVersion: scope.previous.credentialVersion, oldLocator: scope.previous.locator,
    challenge: id(old['challenge']) } }, fields };
}

/** Development-only narrow path, with the currently active bearer and no auth retry or redirect. */
export class HttpWiFiProvRekeyGateway implements WiFiProvRekeyGateway {
  constructor(private readonly origin: string, private readonly session: () => WiFiProvRekeySession | undefined,
    private readonly signal: AbortSignal, private readonly assertCurrent: () => void,
    // Android WebView requires the global receiver when calling native fetch.
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {
    let url: URL;
    try { url = new URL(origin); } catch { throw unavailable(); }
    if (url.protocol !== 'https:' || url.origin !== origin) throw unavailable();
  }

  async prepare(scope: WiFiProvRekeyScope): Promise<WiFiProvRekeyServerState> {
    const { common } = readState(await this.request('prepare', scope, { instance: scope.deviceInstanceId,
      accessEpoch: scope.accessEpoch, fromVersion: scope.previous.credentialVersion, oldLocator: scope.previous.locator }), scope, 'prepare');
    return common;
  }

  async issue(scope: WiFiProvRekeyScope, proof: Uint8Array): ReturnType<WiFiProvRekeyGateway['issue']> {
    const { common, fields } = readState(await this.request('issue', scope, { proof: checkedMac(proof) }), scope, 'issue');
    const transfer = object(fields['transfer'], ['iv', 'box']);
    const iv = binary(transfer['iv'], 12);
    try { return { ...common, transfer: { iv, box: binary(transfer['box'], 48) } }; }
    catch (error) { iv.fill(0); throw error; }
  }

  async confirm(scope: WiFiProvRekeyScope, receipt: Uint8Array): ReturnType<WiFiProvRekeyGateway['confirm']> {
    const { common, fields } = readState(await this.request('confirm', scope, { receipt: checkedMac(receipt) }), scope, 'confirm');
    return { ...common, wifiPermit: binary(fields['wifiPermit'], 32) };
  }

  async read(scope: WiFiProvRekeyScope): Promise<WiFiProvRekeyServerState | null> {
    const data = await this.request('read', scope, {});
    return data === null ? null : readState(data, scope, 'read').common;
  }

  private current(scope: WiFiProvRekeyScope): WiFiProvRekeySession {
    if (this.signal.aborted) throw coded('WIFIPROV_OPERATION_CANCELLED');
    this.assertCurrent();
    const auth = this.session();
    if (scope.authority !== this.origin || scope.region !== 'Development' || !auth || auth.accountId !== scope.accountId
      || auth.region !== scope.region || !auth.token || auth.token.length > 16_384 || !/^[\x21-\x7e]+$/.test(auth.token))
      throw coded('WIFIPROV_REKEY_ACCOUNT_CHANGED');
    return auth;
  }

  private async request(action: Action, scope: WiFiProvRekeyScope, body: Fields): Promise<unknown> {
    const auth = this.current(scope);
    const url = this.origin + ENDPOINT + id(scope.operationId) + '/' + action;
    const stop = new AbortController(), abort = () => stop.abort();
    this.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15_000);
    try {
      if (this.signal.aborted) abort();
      let response: Response;
      try {
        response = await this.fetcher(url, { method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit',
          referrerPolicy: 'no-referrer', signal: stop.signal,
          headers: { Authorization: 'Bearer ' + auth.token, 'X-Region': scope.region, 'X-Blinker-Contract': CONTRACT,
            'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ logicalDeviceId: scope.logicalDeviceId, ...body }) });
      } catch { this.current(scope); throw unavailable(); }
      this.current(scope);
      if (stop.signal.aborted) throw unavailable();
      if (response.redirected || response.url !== url || response.status !== 200
        || !response.headers.get('cache-control')?.split(',').some(value => value.trim().toLowerCase() === 'no-store')) throw unavailable();
      const envelope = object(await boundedJson(response), ['status', 'data']);
      this.current(scope);
      if (stop.signal.aborted) throw unavailable();
      if (envelope['status'] !== 200) throw invalid();
      return envelope['data'];
    } finally { clearTimeout(timer); this.signal.removeEventListener('abort', abort); }
  }
}
