import { Subscription } from 'rxjs';
import type { DataService } from '../../services/data.service';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext,
  DeviceV2AccountContext, DeviceV2AccountSource } from '../account-scope';

type AccountSource = DeviceV2AccountSource & Pick<DataService, 'authDataChanged'>;
const changed = () => Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
const abortReason = (signal: AbortSignal): unknown => signal.reason ?? new DOMException('Account wait cancelled', 'AbortError');

/** Only initial native account readiness, never a retry of a failed read or write. */
export async function waitForWiFiProvAccount(
  data: AccountSource, authority: string, signal: AbortSignal,
): Promise<DeviceV2AccountContext> {
  if (signal.aborted) throw abortReason(signal);
  const initialEpoch = data.sessionEpoch, hadAuth = !!data.auth;
  if (!Number.isSafeInteger(initialEpoch) || initialEpoch < 0) throw Error('DEVICE_V2_ACCOUNT_CONTEXT_INVALID');
  if (!data.auth && data.user?.id) throw Error('DEVICE_V2_ACCOUNT_SCOPE_INVALID');

  const confirm = (context: DeviceV2AccountContext): DeviceV2AccountContext => {
    if (signal.aborted) throw abortReason(signal);
    if (!data.auth) throw changed();
    assertDeviceV2AccountContext(data, context);
    return context;
  };
  if (data.auth && (data.auth.uuid || data.user?.id)) {
    const context = captureDeviceV2AccountContext(data, authority);
    await Promise.resolve();
    return confirm(context);
  }

  return new Promise<DeviceV2AccountContext>((resolve, reject) => {
    const pending = new Subscription();
    let settled = false, queued = false;
    const cleanup = () => { pending.unsubscribe(); signal.removeEventListener('abort', onAbort); };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true; cleanup(); reject(error);
    };
    const onAbort = () => fail(abortReason(signal));
    const check = (announced = false) => {
      if (settled || queued) return;
      if (signal.aborted) { onAbort(); return; }
      const epoch = data.sessionEpoch;
      if (!Number.isSafeInteger(epoch) || epoch < initialEpoch || epoch > initialEpoch + (hadAuth ? 0 : 1)
        || (!data.auth && (announced || epoch !== initialEpoch))) { fail(changed()); return; }
      if (!data.auth || (!data.auth.uuid && !data.user?.id)) return;
      try {
        const context = captureDeviceV2AccountContext(data, authority);
        queued = true; pending.unsubscribe();
        // A logout/cancel queued in the same turn must beat an initial restore.
        queueMicrotask(() => {
          if (settled) return;
          try { const value = confirm(context); settled = true; cleanup(); resolve(value); }
          catch (error) { fail(error); }
        });
      } catch (error) { fail(error); }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.add(data.authDataChanged.subscribe(() => check(true)));
    // Also cover readiness restored while the caller was preparing this wait.
    check();
  });
}
