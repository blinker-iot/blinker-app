import { readWiFiProvSoftApAttempt } from './wifiprov-network-state';

describe('bounded native provisioning network marker read', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it.each([false, true])('returns only the explicit native marker %s without interpreting ready', async softApAttempted => {
    const client = { getProvisioningNetworkState: vi.fn(async function () {
      expect(this).toBe(client); return { softApAttempted, ready: !softApAttempted };
    }) };
    expect(await readWiFiProvSoftApAttempt(client, new AbortController().signal)).toBe(softApAttempted);
    expect(client.getProvisioningNetworkState).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('ends a stalled native read once at the deadline without retry or accepting a late response', async () => {
    let done!: (state: unknown) => void;
    const client = { getProvisioningNetworkState: vi.fn(() => new Promise(resolve => { done = resolve; })) };
    const work = readWiFiProvSoftApAttempt(client, new AbortController().signal);
    const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_NETWORK_STATE_UNCONFIRMED' });
    await vi.advanceTimersByTimeAsync(3000); await rejected;
    done({ softApAttempted: false }); await Promise.resolve();
    expect(client.getProvisioningNetworkState).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not call native for an already cancelled read', async () => {
    const controller = new AbortController(); controller.abort();
    const client = { getProvisioningNetworkState: vi.fn() };
    await expect(readWiFiProvSoftApAttempt(client, controller.signal)).rejects.toMatchObject({ code: 'WIFIPROV_NETWORK_STATE_UNCONFIRMED' });
    expect(client.getProvisioningNetworkState).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an in-flight read and removes its deadline without accepting a late rejection', async () => {
    let fail!: (error: Error) => void;
    const client = { getProvisioningNetworkState: vi.fn(() => new Promise((_resolve, reject) => { fail = reject; })) };
    const controller = new AbortController(), work = readWiFiProvSoftApAttempt(client, controller.signal);
    await Promise.resolve(); const rejected = expect(work).rejects.toMatchObject({ code: 'WIFIPROV_NETWORK_STATE_UNCONFIRMED' });
    controller.abort(); await rejected; fail(Error('late boundary failure')); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0); expect(client.getProvisioningNetworkState).toHaveBeenCalledOnce();
  });
});
