import type { WiFiProvCloudCheck } from './wifiprov-cloud-reconciliation';

export type WiFiProvOfficialReceipt = 'confirmed' | 'rejected' | 'unknown';
export type WiFiProvCompletionCloud = 'checking' | WiFiProvCloudCheck | 'blocked';
export type WiFiProvCompletionReason = 'timeout' | 'read-error' | 'context-changed' | 'cancelled';

export interface WiFiProvCompletionResult {
  readonly officialReceipt: WiFiProvOfficialReceipt;
  readonly cloud: WiFiProvCompletionCloud;
  readonly outcome: 'checking' | 'ready' | 'wifi-connected' | 'failed' | 'unconfirmed';
  readonly reason?: WiFiProvCompletionReason;
}

export interface WiFiProvCompletionPorts {
  readonly signal: AbortSignal;
  assertCurrent(): void;
  /** Existing authenticated observation, including owner death, instance, freshness and CAS checks. */
  read(signal: AbortSignal): Promise<WiFiProvCloudCheck>;
}

export const WIFI_PROV_COMPLETION_WINDOW_MS = 30000;
const observationOffsets = [0, 2000, 5000, 10000, 20000] as const;

/** A product conclusion never rewrites the historical official receipt. */
export function wiFiProvCompletionResult(
  officialReceipt: WiFiProvOfficialReceipt, cloud: WiFiProvCompletionCloud,
  reason?: WiFiProvCompletionReason,
): WiFiProvCompletionResult {
  const outcome = officialReceipt === 'rejected' ? 'failed' : cloud === 'online' ? 'ready'
    : cloud === 'checking' ? 'checking' : officialReceipt === 'confirmed' ? 'wifi-connected' : 'unconfirmed';
  return Object.freeze({ officialReceipt, cloud, outcome, ...(reason ? { reason } : {}) });
}

/**
 * A bounded confirmation phase of ONE user-started onboarding operation.
 * Only a normal "not yet observed" result schedules another observation;
 * a read/auth/network error never retries. There is deliberately no write port.
 */
export async function confirmWiFiProvCompletion(
  officialReceipt: WiFiProvOfficialReceipt, ports: WiFiProvCompletionPorts,
): Promise<WiFiProvCompletionResult> {
  if (officialReceipt === 'rejected') return wiFiProvCompletionResult(officialReceipt, 'unconfirmed');
  const controller = new AbortController(), startedAt = performance.now();
  const deadlineAt = startedAt + WIFI_PROV_COMPLETION_WINDOW_MS;
  let stopReason: 'timeout' | 'cancelled' | undefined;
  const stop = (reason: 'timeout' | 'cancelled') => {
    if (controller.signal.aborted) return;
    stopReason = reason;
    controller.abort();
  };
  const cancel = () => stop('cancelled');
  ports.signal.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => stop('timeout'), WIFI_PROV_COMPLETION_WINDOW_MS);
  if (ports.signal.aborted) cancel();
  const check = () => {
    if (controller.signal.aborted) throw Error('WIFIPROV_COMPLETION_STOPPED');
    if (performance.now() >= deadlineAt) {
      stop('timeout'); throw Error('WIFIPROV_COMPLETION_STOPPED');
    }
    try { ports.assertCurrent(); }
    catch { throw Object.assign(Error('WIFIPROV_COMPLETION_CONTEXT_CHANGED'), { contextChanged: true }); }
  };
  const step = <T>(work: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => { settled = true; controller.signal.removeEventListener('abort', aborted); };
    const aborted = () => {
      if (settled) return;
      finish(); reject(Error('WIFIPROV_COMPLETION_STOPPED'));
    };
    controller.signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => { check(); return work(); }).then(value => {
      if (settled) return;
      finish(); resolve(value);
    }, error => {
      if (settled) return;
      finish(); reject(error);
    });
    if (controller.signal.aborted) aborted();
  });
  const waitUntil = (at: number): Promise<void> => {
    check();
    if (at <= performance.now()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', aborted); };
      const aborted = () => { cleanup(); reject(Error('WIFIPROV_COMPLETION_STOPPED')); };
      const timer = setTimeout(() => { cleanup(); resolve(); }, Math.max(0, at - performance.now()));
      controller.signal.addEventListener('abort', aborted, { once: true });
      if (controller.signal.aborted) aborted();
    });
  };
  try {
    check();
    for (const offset of observationOffsets) {
      // A slow previous response cannot cause a burst of overdue requests.
      if (offset !== 0 && startedAt + offset <= performance.now()) continue;
      await waitUntil(startedAt + offset);
      const result = await step(() => ports.read(controller.signal));
      check();
      if (result === 'online' || result === 'unavailable') return wiFiProvCompletionResult(officialReceipt, result);
      if (result !== 'unconfirmed') throw Error('WIFIPROV_COMPLETION_RESPONSE_INVALID');
    }
    await waitUntil(deadlineAt);
    return wiFiProvCompletionResult(officialReceipt, 'unconfirmed', 'timeout');
  } catch (error) {
    if (stopReason) return wiFiProvCompletionResult(officialReceipt, 'unconfirmed', stopReason);
    return isContextError(error)
      ? wiFiProvCompletionResult(officialReceipt, 'blocked', 'context-changed')
      : wiFiProvCompletionResult(officialReceipt, 'unavailable', 'read-error');
  } finally {
    clearTimeout(deadline);
    ports.signal.removeEventListener('abort', cancel);
  }
}

function isContextError(error: unknown): boolean {
  const value = error as { contextChanged?: boolean; status?: number; code?: string; message?: string;
    error?: { errorCode?: string } } | null;
  const code = value?.error?.errorCode ?? value?.code ?? value?.message ?? '';
  return value?.contextChanged === true || [401, 403, 404, 409, 410].includes(value?.status ?? 0)
    || ['WIFIPROV_KEY_CONTEXT_CHANGED', 'WIFIPROV_DEVICE_CONTEXT_CHANGED', 'WIFIPROV_CHECKPOINT_EXPIRED',
      'WIFIPROV_CHECKPOINT_NOT_CURRENT', 'WIFIPROV_ADMIN_EPOCH_CONFLICT', 'WIFIPROV_CHECKPOINT_CONFLICT',
      'WIFIPROV_CHECKPOINT_CHANGED', 'WIFIPROV_ALLOCATION_CONFLICT', 'WIFIPROV_ALLOCATION_CHANGED',
      'WIFIPROV_CLOUD_RECEIPT_INVALID', 'DEVICE_V2_NOT_FOUND', 'DEVICE_V2_NOT_CURRENT',
      'WIFIPROV_CLOSE_UNCONFIRMED', 'WIFIPROV_CLOUD_BOUNDARY_BUSY', 'BLE_SCAN_CLOSE_FAILED',
      'DEVICE_V2_ACCOUNT_CONTEXT_CHANGED', 'DEVICE_V2_ACCOUNT_CONTEXT_INVALID',
      'DEVICE_V2_ACCOUNT_SCOPE_INVALID'].includes(code);
}
