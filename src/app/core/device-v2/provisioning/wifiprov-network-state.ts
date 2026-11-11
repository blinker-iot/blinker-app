const unconfirmed = () => Object.assign(
  Error('无法确认配网网络状态，请使用匹配的原生 App 并手动重新开始；不会自动重试。'),
  { code: 'WIFIPROV_NETWORK_STATE_UNCONFIRMED' },
);

/** Reads only the native sticky SoftAP marker, never Internet readiness or a release permit. */
export function readWiFiProvSoftApAttempt(client: unknown, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(unconfirmed()); return; }
    let settled = false;
    const finish = (value?: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); signal.removeEventListener('abort', onAbort);
      if (typeof value === 'boolean') resolve(value); else reject(unconfirmed());
    };
    const onAbort = () => finish();
    // A local read deadline only rejects; it can never clear a sticky marker.
    const deadline = setTimeout(onAbort, 3000);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => {
      if (settled) return;
      const method = (client as { getProvisioningNetworkState?: unknown })?.getProvisioningNetworkState;
      if (typeof method !== 'function') throw unconfirmed();
      return method.call(client);
    }).then(state => {
      const value = (state as { softApAttempted?: unknown } | null)?.softApAttempted;
      finish(typeof value === 'boolean' ? value : undefined);
    }, () => finish());
  });
}
