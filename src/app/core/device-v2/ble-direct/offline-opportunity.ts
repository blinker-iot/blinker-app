import type { BleDirectConnectionAdmission } from './transport';

// One local radio budget, not an owner registry or scheduler. The caller owns
// permission/lifetime; the BLE service owns acquisition and exact native cleanup.
// Engineering candidates paired with GatewayGattRadio; not release defaults.
export class BleOfflineOpportunity {
  static readonly acquisitionMillis = 16_000;
  private static readonly occupancyMillis = 10_000;
  private static readonly quietMillis = 6_000;
  private busy = false;
  // A new App process must first give the Hub an opportunity too.
  private availableAt = performance.now() + BleOfflineOpportunity.quietMillis;

  async connect(
    signal: AbortSignal,
    assertPermitted: () => void,
    retire: (reason: unknown) => void,
    acquire: (admission: BleDirectConnectionAdmission) => Promise<void>,
    release: (admission: BleDirectConnectionAdmission) => Promise<void>,
  ): Promise<void> {
    signal.throwIfAborted(); assertPermitted();
    if (this.busy || performance.now() < this.availableAt) throw Error('BLE_DIRECT_OPPORTUNITY_BUSY');
    this.busy = true;
    const controller = new AbortController();
    let deadline = performance.now() + BleOfflineOpportunity.acquisitionMillis;
    let acquired = false, retired = false;
    let cleanup: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const stop = (reason: unknown) => {
      if (retired) return;
      retired = true;
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      // Drain original opening, including late SDK success, before an exact
      // release. Rejected release keeps busy in this process, with no refund.
      cleanup = opening.then(() => undefined, error => error).then(async openingError => {
        await release(admission);
        // Account retirement can remove the logical opening before release is
        // requested. Its native failure is still not a physical release receipt.
        if (openingError instanceof Error && openingError.message === 'BLE_DIRECT_NATIVE_RELEASE_FAILED') throw openingError;
        this.availableAt = performance.now() + BleOfflineOpportunity.quietMillis;
        this.busy = false;
      });
      void cleanup.catch(() => undefined);
      controller.abort(reason); retire(reason); // Logical retirement is not a release receipt.
    };
    const check = () => {
      controller.signal.throwIfAborted();
      try {
        assertPermitted();
        if (performance.now() >= deadline) throw Error('BLE_DIRECT_OPPORTUNITY_EXPIRED');
      } catch (error) { stop(error); throw error; }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stop(Error('BLE_DIRECT_OPPORTUNITY_EXPIRED')), Math.max(0, deadline - performance.now()));
    };
    const admission: BleDirectConnectionAdmission = {
      signal: controller.signal, assertAcquire: check, assertActive: check,
      onAcquire: () => {
        check();
        if (!acquired) {
          acquired = true; deadline = performance.now() + BleOfflineOpportunity.occupancyMillis; arm();
        }
      },
      onClosed: () => stop(Error('BLE_DIRECT_DISCONNECTED')),
    };
    const cancel = () => stop(signal.reason);
    const opening = Promise.resolve().then(() => { check(); return acquire(admission); });
    signal.addEventListener('abort', cancel, { once: true }); arm();
    if (signal.aborted) cancel();
    try { await opening; check(); }
    catch (error) { stop(error); await cleanup; throw error; }
  }
}
