import { Capacitor, registerPlugin } from '@capacitor/core';
import type { DeviceKeyContext } from '../../model/response.model';
import { getServiceRegion } from '../../../configs/service-region.config';
import { validateDeviceV2AccountScope, type DeviceV2AccountContext, type DeviceV2AccountScopeProvider } from '../account-scope';
import { base64UrlEncode } from '../base64url';
import { BleDirectCrypto } from '../ble-direct/crypto';
import { bytesToHex } from '../../protocol/device-v2/codec';
import { normalizeSealedInstallationName, sealedInstallationContext, sealedInstallationId, sealedInstallationNameDigest,
  validateSealedInstallation, type WiFiProvInstallPhase, type WiFiProvInstallRegion, type WiFiProvSealedInstallation,
} from './wifiprov-sealed-installation-contract';

const PLUGIN = 'BlinkerWiFiProvAllocation';
const MAX_RECORDS = 32;
const invalid = () => Error('WIFIPROV_SEALED_INSTALLATION_INVALID');
const conflict = () => Error('WIFIPROV_IDENTITY_UNCONFIRMED');
const unavailable = () => Error('WIFIPROV_SEALED_DURABILITY_UNAVAILABLE');

export interface WiFiProvSealedNativePort {
  read(options: { scope: string; instance: string }): Promise<{ encoded: string | null }>;
  list(options: { scope: string }): Promise<{ encoded: string[] }>;
  /** applied only after synchronous native commit; JS readback is not proof. */
  compareAndSet(options: { scope: string; instance: string; expected: string | null; encoded: string }): Promise<{ applied: boolean }>;
}

let nativePort: WiFiProvSealedNativePort | undefined;
const hasNativePort = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable(PLUGIN);

type Owner = DeviceV2AccountContext & { region: WiFiProvInstallRegion; scope: string };

function exactField(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !Object.hasOwn(value, key)) throw invalid();
  return (value as Record<string, unknown>)[key];
}

function snapshotInstance(instance: Uint8Array): Uint8Array {
  if (!(instance instanceof Uint8Array) || instance.length !== 16 || !instance.some(Boolean)) throw invalid();
  return Uint8Array.from(instance);
}

function decode(encoded: unknown, instance?: string): WiFiProvSealedInstallation {
  if (typeof encoded !== 'string' || encoded.length > 2048) throw invalid();
  const record = validateSealedInstallation(JSON.parse(encoded));
  if ((instance !== undefined && record.deviceInstanceId !== instance) || JSON.stringify(record) !== encoded) throw invalid();
  return record;
}

/** Companion native persistence port of the existing allocation store. Legacy
 * metadata and UNKNOWN remain in their old namespace and are never rewritten. */
export class WiFiProvSealedInstallationStore {
  constructor(private readonly account: DeviceV2AccountScopeProvider,
    private readonly legacyExists: (instance: Uint8Array) => Promise<boolean>,
    private readonly native?: WiFiProvSealedNativePort,
    private readonly isAvailable = hasNativePort, private readonly region = getServiceRegion,
    private readonly crypto = new BleDirectCrypto()) {}

  get available(): boolean { return this.isAvailable(); }
  private get port(): WiFiProvSealedNativePort { return this.native ?? (nativePort ??= registerPlugin<WiFiProvSealedNativePort>(PLUGIN)); }

  async load(instance: Uint8Array, region: WiFiProvInstallRegion): Promise<WiFiProvSealedInstallation | undefined> {
    const device = base64UrlEncode(snapshotInstance(instance)), owner = await this.owner(region);
    const encoded = await this.read(owner, device);
    return encoded === null ? undefined : decode(encoded, device);
  }

  async list(region: WiFiProvInstallRegion): Promise<WiFiProvSealedInstallation[]> {
    const owner = await this.owner(region);
    const encoded = exactField(await this.port.list({ scope: owner.scope }), 'encoded');
    this.assertOwner(owner);
    if (!Array.isArray(encoded) || encoded.length > MAX_RECORDS) throw invalid();
    const records = encoded.map(value => decode(value));
    if (new Set(records.map(record => record.deviceInstanceId)).size !== records.length
      || new Set(records.map(record => record.requestId)).size !== records.length) throw invalid();
    return records.filter(record => record.phase !== 'wifi-confirmed');
  }

  async prepare(instance: Uint8Array, name: string, region: WiFiProvInstallRegion): Promise<WiFiProvSealedInstallation> {
    const device = snapshotInstance(instance), normalized = normalizeSealedInstallationName(name), owner = await this.owner(region);
    const hasLegacy = await this.legacyExists(device.slice());
    this.assertOwner(owner);
    if (hasLegacy) throw conflict();
    const nameDigest = await sealedInstallationNameDigest(normalized);
    this.assertOwner(owner);
    const record = validateSealedInstallation({ version: 1, deviceInstanceId: base64UrlEncode(device),
      requestId: 'wifiprov-' + bytesToHex(this.crypto.random(16)), nameDigest, phase: 'prepared' });
    await this.cas(owner, record, null);
    return record;
  }

  async dispatch(instance: Uint8Array, requestId: string, recipientPublicKey: string, region: WiFiProvInstallRegion): Promise<void> {
    const recipient = sealedInstallationId(recipientPublicKey, 32);
    await this.transition(instance, requestId, region, 'prepared', 'create-dispatched', { recipientPublicKey: recipient });
  }

  async bind(instance: Uint8Array, requestId: string, context: DeviceKeyContext, region: WiFiProvInstallRegion): Promise<void> {
    await this.transition(instance, requestId, region, 'create-dispatched', 'card-confirmed', { context: sealedInstallationContext(context) });
  }

  mark(instance: Uint8Array, requestId: string, region: WiFiProvInstallRegion,
    to: 'bootstrap-dispatched' | 'bootstrap-accepted' | 'wifi-dispatched' | 'wifi-confirmed'): Promise<void> {
    const previous = { 'bootstrap-dispatched': 'card-confirmed', 'bootstrap-accepted': 'bootstrap-dispatched',
      'wifi-dispatched': 'bootstrap-accepted', 'wifi-confirmed': 'wifi-dispatched' } as const;
    return this.transition(instance, requestId, region, previous[to], to, {});
  }

  private async transition(instance: Uint8Array, requestId: string, region: WiFiProvInstallRegion,
    from: WiFiProvInstallPhase, to: WiFiProvInstallPhase, fields: Partial<WiFiProvSealedInstallation>): Promise<void> {
    const device = base64UrlEncode(snapshotInstance(instance)), owner = await this.owner(region);
    const encoded = await this.read(owner, device);
    if (encoded === null) throw conflict();
    const current = decode(encoded, device);
    if (current.requestId !== requestId || current.phase !== from) throw conflict();
    await this.cas(owner, validateSealedInstallation({ ...current, ...fields, phase: to }), encoded);
  }

  private async read(owner: Owner, instance: string): Promise<string | null> {
    const value = exactField(await this.port.read({ scope: owner.scope, instance }), 'encoded');
    this.assertOwner(owner);
    if (value === null) return null;
    if (typeof value !== 'string') throw invalid();
    return value;
  }

  private async cas(owner: Owner, next: WiFiProvSealedInstallation, expected: string | null): Promise<void> {
    this.assertOwner(owner);
    const result = exactField(await this.port.compareAndSet({ scope: owner.scope, instance: next.deviceInstanceId,
      expected, encoded: JSON.stringify(next) }), 'applied');
    this.assertOwner(owner);
    if (result !== true) throw conflict();
  }

  private accountContext(): DeviceV2AccountContext {
    const raw = this.account() as DeviceV2AccountContext;
    if (!Number.isSafeInteger(raw?.sessionEpoch) || raw.sessionEpoch < 0) throw unavailable();
    return { ...validateDeviceV2AccountScope(raw), sessionEpoch: raw.sessionEpoch };
  }

  private async owner(region: WiFiProvInstallRegion): Promise<Owner> {
    if (!this.available || !['China', 'Global', 'Development'].includes(region) || this.region() !== region) throw unavailable();
    const account = this.accountContext();
    const hash = await this.crypto.sha256(new TextEncoder().encode(JSON.stringify([
      'blinker.wifiprov.sealed-allocation.v1', account.authority, account.accountId, region,
    ])));
    try {
      const result = { ...account, region, scope: base64UrlEncode(hash) };
      this.assertOwner(result);
      return result;
    } finally { hash.fill(0); }
  }

  private assertOwner(expected: Owner): void {
    const current = this.accountContext();
    if (!this.available || this.region() !== expected.region || current.authority !== expected.authority
      || current.accountId !== expected.accountId || current.sessionEpoch !== expected.sessionEpoch) throw conflict();
  }
}
