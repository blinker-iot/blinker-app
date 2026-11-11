import type { DeviceKeyContext, WiFiProvCloudReadResult } from '../../model/response.model';
import { base64UrlEncode } from '../ble-direct/wire';
import { allocationContext, metadataAllocationContext, sameAllocationContext } from './wifiprov-allocation';

export interface WiFiProvUnknownWiFiReceipt {
  readonly identity: DeviceKeyContext;
  readonly deviceInstanceId: Uint8Array;
  readonly attemptedAt: number;
}

export interface WiFiProvCloudReadPorts {
  signal: AbortSignal;
  assertCurrent(): void;
  /** Must await real, matching owner death. A ready observation cannot implement this port. */
  closeLocal(): Promise<void>;
  assertCloud(): Promise<void>;
  read(instance: Uint8Array, expected: DeviceKeyContext, signal: AbortSignal): Promise<WiFiProvCloudReadResult>;
}

export type WiFiProvCloudCheck = 'online' | 'unconfirmed' | 'unavailable';
export type WiFiProvCloudIdentityMode = 'logical-peer' | 'metadata-reference';
const coded = (code: string) => Object.assign(Error(code), { code });

/** One scoped observation; callers must preserve the independent official receipt. */
export class WiFiProvCloudObservation {
  private readonly identity: DeviceKeyContext;
  private readonly instance: Uint8Array;
  private readonly attemptedAt: number;
  private busy = false;

  constructor(receipt: WiFiProvUnknownWiFiReceipt, private readonly requireNewSession = false,
    private readonly identityMode: WiFiProvCloudIdentityMode = 'logical-peer') {
    if (identityMode !== 'logical-peer' && identityMode !== 'metadata-reference')
      throw coded('WIFIPROV_CLOUD_IDENTITY_MODE_INVALID');
    // A metadata reference is not a wire peer or evidence that Apply succeeded.
    // It always requires a strictly newer real session, even if callers omit the flag.
    this.requireNewSession = requireNewSession || identityMode === 'metadata-reference';
    this.identity = this.context(receipt.identity);
    if (!(receipt.deviceInstanceId instanceof Uint8Array) || receipt.deviceInstanceId.length !== 16
      || !receipt.deviceInstanceId.some(Boolean) || !Number.isSafeInteger(receipt.attemptedAt) || receipt.attemptedAt < 0) {
      throw coded('WIFIPROV_CLOUD_RECEIPT_INVALID');
    }
    this.instance = receipt.deviceInstanceId.slice();
    this.attemptedAt = receipt.attemptedAt;
  }

  async read(ports: WiFiProvCloudReadPorts): Promise<WiFiProvCloudCheck> {
    if (this.busy) throw coded('WIFIPROV_OPERATION_BUSY');
    this.busy = true;
    const check = () => {
      if (ports.signal.aborted) throw coded('WIFIPROV_OPERATION_CANCELLED');
      ports.assertCurrent();
    };
    const step = async <T>(work: () => Promise<T>): Promise<T> => {
      check();
      // Cancel UI observation promptly, without treating cancellation as owner death.
      const result = await new Promise<T>((resolve, reject) => {
        const aborted = () => { finish(); reject(coded('WIFIPROV_OPERATION_CANCELLED')); };
        const finish = () => ports.signal.removeEventListener('abort', aborted);
        ports.signal.addEventListener('abort', aborted, { once: true });
        Promise.resolve().then(() => { check(); return work(); }).then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
        if (ports.signal.aborted) aborted();
      });
      check();
      return result;
    };
    try {
      await step(ports.closeLocal);
      await step(ports.assertCloud);
      const result = await step(() => ports.read(this.instance.slice(), { ...this.identity }, ports.signal));
      if (!sameAllocationContext(this.context(result.device), this.identity)) {
        throw coded('WIFIPROV_KEY_CONTEXT_CHANGED');
      }
      const observation = result.observation;
      if (observation.kind !== 'online') return observation.kind;
      if (observation.deviceInstanceId !== base64UrlEncode(this.instance)) throw coded('WIFIPROV_DEVICE_CONTEXT_CHANGED');
      // A State refresh from a session at or before the strict dispatch fence
      // cannot qualify. For rekey the matching firmware must also gate new-Key
      // login on this Apply and setup-owner exit; these times do not prove Apply.
      if (observation.issuedAt === null || observation.stateUpdatedAt === null
        || observation.issuedAt < this.attemptedAt || observation.stateUpdatedAt < observation.issuedAt
        || observation.observedAt < observation.stateUpdatedAt
        || (this.requireNewSession && (observation.issuedAt === this.attemptedAt
          || ![observation.issuedAt, observation.stateUpdatedAt, observation.observedAt].every(Number.isSafeInteger)))) return 'unconfirmed';
      return 'online';
    } finally { this.busy = false; }
  }

  private context(value: DeviceKeyContext): DeviceKeyContext {
    return this.identityMode === 'metadata-reference' ? metadataAllocationContext(value) : allocationContext(value);
  }
}

/** A one-shot read per explicit recovery action; never completes or replays the old RPC. */
export class WiFiProvCloudReconciliation extends WiFiProvCloudObservation {
  readonly localReceipt = 'unknown';
}
