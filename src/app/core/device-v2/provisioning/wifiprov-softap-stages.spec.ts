import {
  BLINKER_CONFIG_ENDPOINT, BlinkerConfigInfo, BlinkerConfigOperation, BlinkerConfigStatus,
  decodeBlinkerConfigInfo, decodeBlinkerConfigStatus, encodeBlinkerConfigBootstrap,
  encodeBlinkerConfigInfoRequest, encodeBlinkerConfigInstall,
} from './esp32-wifiprov';
import { IsolatedWiFiProvOwner, isolatedWiFiProvOwner, WiFiProvSoftApStages } from './wifiprov-softap-stages';

const sessionA = '11111111-1111-4111-8111-111111111111';
const sessionB = '22222222-2222-4222-8222-222222222222';
const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const owner = (session = sessionA): IsolatedWiFiProvOwner => ({ kind: 'isolated-softap', version: 1, session });
const turn = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }),
    resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}
function rawInfo(flags = 0, epoch = 0): Uint8Array {
  const raw = new Uint8Array(24); raw.set([2, BlinkerConfigOperation.GetInfo, 0, flags]);
  raw.fill(1, 4, 20); new DataView(raw.buffer).setUint32(20, epoch, false); return raw;
}
const ack = (operation: BlinkerConfigOperation, status = 0) => Uint8Array.of(2, operation, status);
const instances: WiFiProvSoftApStages[] = [];
function setup(flags = 0, epoch = 0) {
  const abort = new AbortController(), info = decodeBlinkerConfigInfo(rawInfo(flags, epoch));
  const ports = { signal: abort.signal, assertCurrent: vi.fn(), assertCloud: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined), reopen: vi.fn(async () => ({ owner: owner(sessionB), info })), waiting: vi.fn() };
  const original = owner(), stages = new WiFiProvSoftApStages(original, ports); instances.push(stages);
  return { abort, ports, stages, original, info };
}
async function baseline(f: ReturnType<typeof setup>, flags = 0, epoch = 0) {
  const raw = rawInfo(flags, epoch), work = vi.fn(async () => raw);
  await f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), work);
  expect(work).toHaveBeenCalledOnce(); return raw;
}
async function cloud(f: ReturnType<typeof setup>) {
  const prepare = f.stages.prepareCloud(); await turn();
  expect(f.stages.state).toBe('await-cloud'); f.stages.continue(); await prepare;
  expect(f.stages.state).toBe('cloud');
}
afterEach(() => { for (const instance of instances.splice(0)) instance.cancel(); vi.restoreAllMocks(); });

describe('isolated WiFiProv owner contract', () => {
  it('accepts only the explicit Security1 SoftAP owner and keeps a detached immutable snapshot', () => {
    const metadata = owner(), parsed = isolatedWiFiProvOwner({ transport: 'softap', security: 1, localOwner: metadata });
    metadata.session = sessionB; expect(parsed.session).toBe(sessionA); expect(Object.isFrozen(parsed)).toBe(true);
    const f = setup(); f.original.session = sessionB; expect(f.stages.owner.session).toBe(sessionA);
  });

  it.each([
    undefined, { transport: 'ble', security: 1, localOwner: owner() },
    { transport: 'softap', security: 2, localOwner: owner() },
    { transport: 'softap', security: 1, capabilities: ['isolated-softap'], ready: true },
    ...[{ ...owner(), kind: 'softap' }, { ...owner(), version: 2 }, { ...owner(), session: '1-1-1-1-1' },
      { ...owner(), session: '00000000-0000-0000-0000-000000000000' }, { ...owner(), ready: true }]
      .map(localOwner => ({ transport: 'softap', security: 1, localOwner })),
  ])('does not turn missing/invalid ownership metadata into a release proof: %j', device => {
    expect(() => isolatedWiFiProvOwner(device)).toThrowError(expect.objectContaining({ code: 'WIFIPROV_ISOLATED_OWNER_REQUIRED' }));
  });
});

describe('explicit isolated SoftAP Cloud/Local phases', () => {
  it('needs a real initial GetInfo before closing for Cloud', async () => {
    const f = setup(); await expect(f.stages.prepareCloud()).rejects.toMatchObject({ code: 'WIFIPROV_DEVICE_CONTEXT_REQUIRED' });
    expect(f.ports.close).not.toHaveBeenCalled(); expect(f.ports.assertCloud).not.toHaveBeenCalled();
  });

  it('waits for death-backed close and one explicit continue, then reuses consecutive Cloud operations', async () => {
    const f = setup(); await baseline(f); const close = deferred<void>(); f.ports.close.mockReturnValueOnce(close.promise);
    const first = vi.fn(async () => 'first'), pending = f.stages.cloud(first);
    await turn(); expect(f.stages.state).toBe('closing'); expect(first).not.toHaveBeenCalled();
    f.stages.continue(); close.resolve(); await turn();
    expect(f.stages.state).toBe('await-cloud'); expect(first).not.toHaveBeenCalled();
    f.stages.continue(); f.stages.continue(); expect(await pending).toBe('first');
    const second = vi.fn(async () => 'second'); expect(await f.stages.cloud(second)).toBe('second');
    expect(f.ports.close).toHaveBeenCalledOnce(); expect(f.ports.assertCloud).toHaveBeenCalledTimes(2);
    expect(f.ports.waiting.mock.calls.filter(([stage]) => stage === 'cloud')).toHaveLength(1);
    const local = vi.fn(async () => 'local'), resume = f.stages.local(local);
    await turn(); expect(f.stages.state).toBe('await-local'); expect(f.ports.reopen).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled(); f.stages.continue(); expect(await resume).toBe('local');
    expect(f.ports.reopen).toHaveBeenCalledOnce(); expect(f.stages.owner.session).toBe(sessionB);
  });

  it('does not issue Cloud work or another close after an unconfirmed close', async () => {
    const f = setup(); await baseline(f);
    const unknown = Object.assign(Error('fixture-close-unknown'), { code: 'WIFIPROV_CLOSE_UNCONFIRMED' });
    f.ports.close.mockRejectedValueOnce(unknown); const work = vi.fn(async () => undefined);
    await expect(f.stages.cloud(work)).rejects.toBe(unknown);
    await expect(f.stages.cloud(work)).rejects.toBe(unknown);
    expect(f.ports.close).toHaveBeenCalledOnce(); expect(work).not.toHaveBeenCalled();
    expect(f.ports.waiting).not.toHaveBeenCalledWith('cloud'); expect(f.stages.state).toBe('failed');
  });

  it('a Cloud check failure does not send the HTTP operation or automatically retry it', async () => {
    const f = setup(); await baseline(f); const error = Error('fixture-cloud-unavailable');
    f.ports.assertCloud.mockRejectedValueOnce(error); const work = vi.fn(async () => undefined);
    const pending = f.stages.cloud(work); const rejected = expect(pending).rejects.toBe(error);
    await turn(); f.stages.continue(); await rejected;
    expect(work).not.toHaveBeenCalled(); expect(f.ports.assertCloud).toHaveBeenCalledOnce();
    expect(f.stages.state).toBe('failed');
  });

  it('rejects concurrent phase operations without replacing the pending explicit wait', async () => {
    const f = setup(); await baseline(f); const pending = f.stages.prepareCloud(); await turn();
    const other = vi.fn(async () => undefined);
    await expect(f.stages.cloud(other)).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_BUSY' });
    expect(f.stages.state).toBe('await-cloud'); expect(other).not.toHaveBeenCalled();
    f.stages.continue(); await pending; expect(f.ports.close).toHaveBeenCalledOnce();
  });

  it.each(['instance', 'epoch', 'key', 'access', 'bootstrap', 'session'])('never writes after a reopened %s mismatch', async change => {
    const f = setup(); await baseline(f); await cloud(f);
    const nextInfo: BlinkerConfigInfo = { ...f.info, deviceInstanceId: f.info.deviceInstanceId.slice() };
    const nextOwner = owner(sessionB);
    if (change === 'instance') nextInfo.deviceInstanceId[0] = 2;
    if (change === 'epoch') nextInfo.accessEpoch = 1;
    if (change === 'key') nextInfo.hasDeviceKey = true;
    if (change === 'access') nextInfo.hasAccessState = true;
    if (change === 'bootstrap') nextInfo.supportsAccessBootstrap = true;
    if (change === 'session') nextOwner.session = sessionA;
    f.ports.reopen.mockResolvedValueOnce({ owner: nextOwner, info: nextInfo });
    const write = vi.fn(async () => undefined), pending = f.stages.local(write, true);
    const rejected = expect(pending).rejects.toThrow(); await turn(); f.stages.continue(); await rejected;
    expect(write).not.toHaveBeenCalled(); expect(f.stages.owner.session).toBe(sessionA); expect(f.stages.state).toBe('failed');
  });

  it('does not overwrite the baseline with a second changed GetInfo', async () => {
    const f = setup(); const first = await baseline(f); first.fill(0);
    await expect(f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), async () => rawInfo(1)))
      .rejects.toMatchObject({ code: 'WIFIPROV_DEVICE_CONTEXT_CHANGED' });
    expect(f.stages.state).toBe('failed');
  });

  it('advances only the known Install ACK facts before the next same-root reopen', async () => {
    const f = setup(); await baseline(f);
    await f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInstall(key), async () => ack(BlinkerConfigOperation.Install));
    await cloud(f); f.ports.reopen.mockResolvedValueOnce({ owner: owner(sessionB), info: decodeBlinkerConfigInfo(rawInfo(1)) });
    const work = vi.fn(async () => undefined), pending = f.stages.local(work); await turn(); f.stages.continue(); await pending;
    expect(work).toHaveBeenCalledOnce();
  });

  it('captures the Bootstrap epoch before awaiting without rereading the mutated payload', async () => {
    const f = setup(2); await baseline(f, 2); const response = deferred<Uint8Array>();
    const payload = encodeBlinkerConfigBootstrap(key, { accessEpoch: 7, controllerId: new Uint8Array(16).fill(1),
      credentialVersion: 1, controllerSecret: new Uint8Array(32).fill(2) });
    const sent = vi.fn(() => response.promise), pending = f.stages.request(BLINKER_CONFIG_ENDPOINT, payload, sent);
    await turn(); expect(sent).toHaveBeenCalledOnce(); payload.fill(0);
    response.resolve(ack(BlinkerConfigOperation.Bootstrap)); await pending; await cloud(f);
    f.ports.reopen.mockResolvedValueOnce({ owner: owner(sessionB), info: decodeBlinkerConfigInfo(rawInfo(7, 7)) });
    const work = vi.fn(async () => undefined), next = f.stages.local(work); await turn(); f.stages.continue(); await next;
    expect(work).toHaveBeenCalledOnce();
  });

  it('returns explicit device rejection to the original decoder without advancing the root', async () => {
    const f = setup(); await baseline(f); const rejected = ack(BlinkerConfigOperation.Install, BlinkerConfigStatus.StorageFailure);
    const result = await f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInstall(key), async () => rejected);
    expect(result).toBe(rejected); expect(() => decodeBlinkerConfigStatus(result, BlinkerConfigOperation.Install))
      .toThrowError(expect.objectContaining({ status: BlinkerConfigStatus.StorageFailure }));
    await cloud(f); const work = vi.fn(async () => undefined), next = f.stages.local(work);
    await turn(); f.stages.continue(); await next; expect(work).toHaveBeenCalledOnce();
  });

  it('does not advance or retry after a malformed success ACK', async () => {
    const f = setup(); await baseline(f); const work = vi.fn(async () => Uint8Array.of(2, BlinkerConfigOperation.Install, 0, 0));
    await expect(f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInstall(key), work)).rejects.toThrow();
    expect(work).toHaveBeenCalledOnce(); expect(f.stages.state).toBe('failed');
    expect(f.ports.close).not.toHaveBeenCalled();
  });

  it('cancels a close wait without accepting its late proof as permission to send HTTP', async () => {
    const f = setup(); await baseline(f); const closing = deferred<void>(); f.ports.close.mockReturnValueOnce(closing.promise);
    const work = vi.fn(async () => undefined), pending = f.stages.cloud(work);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    await turn(); f.abort.abort(); await rejected; closing.resolve(); await turn();
    expect(work).not.toHaveBeenCalled(); expect(f.ports.assertCloud).not.toHaveBeenCalled();
    expect(f.ports.close).toHaveBeenCalledOnce(); expect(f.stages.state).toBe('cancelled');
  });

  it('cancels before an explicit Local continuation without starting a reconnect or write', async () => {
    const f = setup(); await baseline(f); await cloud(f); const work = vi.fn(async () => undefined);
    const pending = f.stages.local(work, true), rejected = expect(pending).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    await turn(); f.stages.cancel(); await rejected; f.stages.continue();
    expect(f.ports.reopen).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled(); expect(f.ports.close).toHaveBeenCalledOnce();
  });

  it('handles a synchronous page cancellation while publishing the waiting stage without an orphan rejection', async () => {
    const f = setup(); await baseline(f);
    f.ports.waiting.mockImplementation(stage => { if (stage === 'cloud') f.stages.cancel(); });
    const work = vi.fn(async () => undefined);
    await expect(f.stages.cloud(work)).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    expect(f.stages.state).toBe('cancelled'); expect(work).not.toHaveBeenCalled();
    expect(f.ports.close).toHaveBeenCalledOnce();
  });

  it('rejects a late reopened owner after cancellation without changing owner or starting work', async () => {
    const f = setup(); await baseline(f); await cloud(f); const reopen = deferred<{ owner: IsolatedWiFiProvOwner; info: BlinkerConfigInfo }>();
    f.ports.reopen.mockReturnValueOnce(reopen.promise); const work = vi.fn(async () => undefined);
    const pending = f.stages.local(work, true), rejected = expect(pending).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    await turn(); f.stages.continue(); await turn(); expect(f.stages.state).toBe('reconnecting');
    f.abort.abort(); await rejected; reopen.resolve({ owner: owner(sessionB), info: f.info }); await turn();
    expect(f.stages.owner.session).toBe(sessionA); expect(work).not.toHaveBeenCalled(); expect(f.ports.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])('cancels an actual generic Local operation with the original write=%s classification', async write => {
    const f = setup(), response = deferred<string>(), work = vi.fn(() => response.promise);
    const pending = f.stages.local(work, write), rejected = expect(pending).rejects.toMatchObject({
      code: write ? 'PROVISIONING_RESULT_UNKNOWN' : 'WIFIPROV_OPERATION_CANCELLED' });
    await turn(); expect(work).toHaveBeenCalledOnce(); f.stages.cancel(); await rejected;
    response.resolve('late'); await turn(); expect(work).toHaveBeenCalledOnce(); expect(f.ports.close).not.toHaveBeenCalled();
  });

  it('does not downgrade an in-flight native GetInfo custom cancellation from UNKNOWN to read-cancelled', async () => {
    const f = setup(), response = deferred<Uint8Array>(), work = vi.fn(() => response.promise);
    const pending = f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), work);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    await turn(); f.abort.abort(); await rejected; response.resolve(rawInfo()); await turn();
    expect(work).toHaveBeenCalledOnce(); expect(f.stages.state).toBe('cancelled');
  });

  it('preserves an original UNKNOWN rejection without invoking native cleanup or replay itself', async () => {
    const f = setup(), unknown = Object.assign(Error('fixture-unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
    const work = vi.fn(async () => { throw unknown; });
    await expect(f.stages.local(work, true)).rejects.toBe(unknown); f.stages.cancel();
    expect(work).toHaveBeenCalledOnce(); expect(f.ports.close).not.toHaveBeenCalled(); expect(f.stages.state).toBe('failed');
  });

  it('preserves an explicit scan rejection while allowing a later manual Local operation without automatic retry', async () => {
    const f = setup(), error = Object.assign(Error('fixture-scan-failed'), { code: 'WIFIPROV_SCAN_FAILED' });
    const scan = vi.fn(async () => { throw error; });
    await expect(f.stages.local(scan)).rejects.toBe(error); await turn();
    expect(f.stages.state).toBe('local'); expect(scan).toHaveBeenCalledOnce();
    const manual = vi.fn(async () => 'manual-ssid'); expect(await f.stages.local(manual, true)).toBe('manual-ssid');
    expect(manual).toHaveBeenCalledOnce(); expect(scan).toHaveBeenCalledOnce();
    expect(f.ports.close).not.toHaveBeenCalled(); expect(f.ports.reopen).not.toHaveBeenCalled();
  });

  it('keeps an explicit provisioning failure retryable only by another manual Local call, not opaque custom work', async () => {
    const f = setup(1); await baseline(f, 1);
    const error = Object.assign(Error('fixture-provision-failed'), { code: 'WIFIPROV_PROVISION_FAILED' });
    const provision = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ success: true });
    await expect(f.stages.local(provision, true)).rejects.toBe(error); await turn();
    expect(f.stages.state).toBe('local'); expect(provision).toHaveBeenCalledOnce();
    expect(await f.stages.local(provision, true)).toEqual({ success: true });
    expect(provision).toHaveBeenCalledTimes(2); expect(f.ports.close).not.toHaveBeenCalled();
    await expect(f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), async () => { throw error; }))
      .rejects.toBe(error);
    expect(f.stages.state).toBe('failed');
  });

  it.each(['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND'])(
    'preserves exact %s only for an already invoked local WiFi write without retry', async code => {
      const f = setup(), error = Object.assign(Error('generic IPC failure message'), { code });
      const provision = vi.fn(async () => { throw error; });
      await expect(f.stages.local(provision, true)).rejects.toBe(error); await turn();
      expect(f.stages.state).toBe('local'); expect(provision).toHaveBeenCalledOnce();
      expect(f.ports.close).not.toHaveBeenCalled(); expect(f.ports.reopen).not.toHaveBeenCalled();
      expect(f.ports.assertCloud).not.toHaveBeenCalled(); f.stages.cancel();
      await expect(f.stages.local(provision, true)).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
      expect(provision).toHaveBeenCalledOnce();
    });

  it('does not extend exact WiFi failure codes to reads or opaque custom operations', async () => {
    for (const code of ['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND']) for (const mode of ['read', 'custom']) {
      const f = setup(), error = Object.assign(Error('generic IPC failure message'), { code });
      const operation = vi.fn(async () => { throw error; });
      await expect(mode === 'read' ? f.stages.local(operation)
        : f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), operation)).rejects.toBe(error);
      expect(f.stages.state).toBe('failed'); expect(operation).toHaveBeenCalledOnce();
    }
  });

  it('does not accept a Cloud result after account invalidation or issue another request', async () => {
    const f = setup(); await baseline(f); await cloud(f); const response = deferred<string>(), changed = Error('fixture-account-changed');
    const work = vi.fn(() => response.promise), pending = f.stages.cloud(work);
    await turn(); f.ports.assertCurrent.mockImplementation(() => { throw changed; });
    const rejected = expect(pending).rejects.toBe(changed); response.resolve('late'); await rejected;
    expect(work).toHaveBeenCalledOnce(); expect(f.stages.state).toBe('failed');
  });
});
