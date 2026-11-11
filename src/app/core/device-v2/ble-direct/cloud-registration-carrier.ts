import { base64UrlDecode } from '../base64url';
import { IssuedCloudRegistration } from './cloud-registration-wire';
import { BleDirectCrypto } from './crypto';
import { InstalledKeyInitialNetworkOperation, snapshotInstalledKeyInitialNetwork } from './initial-cloud-network-wire';

const domain = new TextEncoder().encode('blinker.initial-cloud-wifi-handoff.v1\0');
const networkDomain = new TextEncoder().encode('blinker.initial-cloud-network-handoff.v1\0');
const hex = new TextEncoder().encode('0123456789abcdef');

interface Credentials {
  ssid: string;
  passphrase: Uint8Array;
  proofOfPossession: Uint8Array;
}

export interface InitialCloudWifiCarrierUse extends Readonly<Credentials> {
  readonly expiresAt: number;
  readonly signal: AbortSignal;
  assertCurrent(): void;
}

export type InitialCloudWifiCarrierConsumer<T = void> = (use: InitialCloudWifiCarrierUse) => Promise<T>;

export async function deriveInitialCloudWifiCredentials(
  crypto: BleDirectCrypto, secret: Uint8Array, intent: IssuedCloudRegistration, binding: Uint8Array,
): Promise<Credentials> {
  return deriveWifiCredentials(crypto, secret, [base64UrlDecode(intent.expectedRoot.deviceInstanceId, 16), binding,
    base64UrlDecode(intent.intentId, 16), base64UrlDecode(intent.targetKey.locator, 16)], domain);
}

export async function deriveInitialCloudNetworkWifiCredentials(
  crypto: BleDirectCrypto, secret: Uint8Array, value: InstalledKeyInitialNetworkOperation, binding: Uint8Array,
): Promise<Credentials> {
  const operation = snapshotInstalledKeyInitialNetwork(value);
  return deriveWifiCredentials(crypto, secret, [base64UrlDecode(operation.expectedRoot.deviceInstanceId, 16), binding,
    base64UrlDecode(operation.operationId, 16), base64UrlDecode(operation.existingLocator, 16)], networkDomain);
}

async function deriveWifiCredentials(crypto: BleDirectCrypto, secret: Uint8Array,
  context: Uint8Array[], derivationDomain: Uint8Array): Promise<Credentials> {
  const binding = context[1];
  if (!(secret instanceof Uint8Array) || secret.length !== 32 || !secret.some(Boolean)
    || !(binding instanceof Uint8Array) || binding.length !== 16 || !binding.some(Boolean)) {
    throw Error('CLOUD_REGISTRATION_CARRIER_CONTEXT_INVALID');
  }
  const encode = async (purpose: number, length: number) => {
    const digest = await crypto.hmac(secret, derivationDomain, Uint8Array.of(purpose), ...context);
    try {
      const out = new Uint8Array(length * 2);
      for (let i = 0; i < length; i++) {
        out[i * 2] = hex[digest[i] >>> 4]; out[i * 2 + 1] = hex[digest[i] & 0x0f];
      }
      return out;
    } finally { digest.fill(0); }
  };
  const name = await encode(1, 8);
  let passphrase: Uint8Array | undefined;
  try {
    passphrase = await encode(2, 16);
    return { ssid: 'BLK-' + String.fromCharCode(...name), passphrase, proofOfPossession: await encode(3, 16) };
  } catch (error) { passphrase?.fill(0); throw error; }
  finally { name.fill(0); }
}

/** Retain only the derived bytes. The opt-in callback must still acquire a
 * fresh physical candidate session and must not persist or log its inputs. */
export function holdInitialCloudWifiCarrier(
  credentials: Credentials, expiresAt: number, ownerSignal: AbortSignal, assertOwner: () => void,
) {
  const stop = new AbortController();
  let used = false, timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (stop.signal.aborted) return;
    credentials.passphrase.fill(0); credentials.proofOfPossession.fill(0);
    ownerSignal.removeEventListener('abort', close);
    if (timer !== undefined) clearTimeout(timer);
    stop.abort();
  };
  const assertCurrent = () => {
    if (stop.signal.aborted || ownerSignal.aborted || Date.now() >= expiresAt) throw Error('CLOUD_REGISTRATION_CARRIER_RETIRED');
    assertOwner();
    if (stop.signal.aborted || ownerSignal.aborted || Date.now() >= expiresAt) throw Error('CLOUD_REGISTRATION_CARRIER_RETIRED');
  };
  if (ownerSignal.aborted || Date.now() >= expiresAt) close();
  else {
    ownerSignal.addEventListener('abort', close, { once: true });
    timer = setTimeout(close, Math.min(120_000, expiresAt - Date.now()));
  }
  return {
    close,
    async use<T>(consume: InitialCloudWifiCarrierConsumer<T>): Promise<T> {
      if (used) throw Error('CLOUD_REGISTRATION_CARRIER_CONSUMED');
      used = true;
      let onAbort: (() => void) | undefined;
      try {
        assertCurrent();
        const result = await new Promise<T>((resolve, reject) => {
          onAbort = () => reject(Error('CLOUD_REGISTRATION_CARRIER_RETIRED'));
          stop.signal.addEventListener('abort', onAbort, { once: true });
          // Invoke directly; never defer the initial consumption after the owner check.
          const unconfirmed = () => reject(Error('CLOUD_REGISTRATION_CARRIER_UNCONFIRMED'));
          try { void consume({ ...credentials, expiresAt, signal: stop.signal, assertCurrent }).then(resolve, unconfirmed); }
          catch { unconfirmed(); }
        });
        assertCurrent();
        return result;
      } finally {
        if (onAbort) stop.signal.removeEventListener('abort', onAbort);
        close();
      }
    },
  };
}
