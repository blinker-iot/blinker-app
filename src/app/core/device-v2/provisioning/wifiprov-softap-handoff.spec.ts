import {
  BLINKER_CONFIG_ENDPOINT, BlinkerConfigInfo, BlinkerConfigOperation,
  decodeBlinkerConfigInfo, encodeBlinkerConfigInfoRequest,
} from './esp32-wifiprov';
import {
  assertWiFiProvSoftApHandoff, consumeWiFiProvSoftApHandoff, IsolatedWiFiProvOwner, WiFiProvSoftApHandoff, WiFiProvSoftApStages,
} from './wifiprov-softap-stages';

const sessionA = '11111111-1111-4111-8111-111111111111';
const sessionB = '22222222-2222-4222-8222-222222222222';
const owner = (session = sessionA): IsolatedWiFiProvOwner => ({ kind: 'isolated-softap', version: 1, session });
const turn = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
function tracked<T>(work: Promise<T>): Promise<T> { void work.catch(() => undefined); return work; }
function rawInfo(): Uint8Array {
  const raw = new Uint8Array(24); raw.set([2, BlinkerConfigOperation.GetInfo, 0, 7]);
  raw.fill(1, 4, 20); new DataView(raw.buffer).setUint32(20, 7, false); return raw;
}
const instances: WiFiProvSoftApStages[] = [];
function setup() {
  const abort = new AbortController(), info = decodeBlinkerConfigInfo(rawInfo());
  const ports = { signal: abort.signal, assertCurrent: vi.fn(), assertCloud: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined), reopen: vi.fn(async () => ({ owner: owner(sessionB), info })), waiting: vi.fn() };
  const original = owner(), stages = new WiFiProvSoftApStages(original, ports); instances.push(stages);
  return { abort, info, ports, original, stages };
}
async function baseline(f: ReturnType<typeof setup>) {
  const raw = rawInfo(); await f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), async () => raw); return raw;
}
async function waiting(f: ReturnType<typeof setup>) {
  await baseline(f); const work = tracked(f.stages.prepareCloud()); await turn();
  expect(f.stages.state).toBe('await-cloud'); return { work, handoff: f.stages.captureHandoff()! };
}
afterEach(() => { for (const instance of instances.splice(0)) instance.cancel(); vi.restoreAllMocks(); });

describe('death-backed in-memory SoftAP handoff checkpoint', () => {
  it('a read-only match cannot consume the explicit next-phase checkpoint', async () => {
    const f = setup(), { work, handoff } = await waiting(f);
    assertWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info);
    assertWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info);
    expect(f.ports.reopen).not.toHaveBeenCalled(); expect(f.ports.assertCloud).not.toHaveBeenCalled();
    consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info);
    expect(() => consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info))
      .toThrowError(expect.objectContaining({ code: 'WIFIPROV_HANDOFF_CONSUMED' }));
    f.stages.cancel(); await expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
  });
  it('exports only after successful close and an actual explicit Cloud wait, without issuing Cloud work', async () => {
    const f = setup(); expect(f.stages.captureHandoff()).toBeUndefined(); await baseline(f);
    expect(f.stages.captureHandoff()).toBeUndefined(); const close = deferred<void>(); f.ports.close.mockReturnValueOnce(close.promise);
    const work = tracked(f.stages.prepareCloud()); await turn(); expect(f.stages.state).toBe('closing');
    expect(f.stages.captureHandoff()).toBeUndefined(); close.resolve(); await turn();
    const handoff = f.stages.captureHandoff()!; expect(handoff.stage).toBe('cloud');
    expect(handoff.previousOwner.session).toBe(sessionA); expect(f.stages.captureHandoff()).toBe(handoff);
    expect(f.ports.close).toHaveBeenCalledOnce(); expect(f.ports.assertCloud).not.toHaveBeenCalled();
    f.stages.cancel(); await expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    expect(f.stages.captureHandoff()).toBeUndefined();
    // The intentionally captured checkpoint survives retiring the old run;
    // consuming it neither continues that Promise nor starts any operation.
    consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info);
    expect(f.ports.reopen).not.toHaveBeenCalled(); expect(f.ports.assertCloud).not.toHaveBeenCalled();
  });

  it('captures an explicit Local wait while the previous owner remains death-confirmed, but not live/reconnecting', async () => {
    const f = setup(), pending = await waiting(f); f.stages.continue(); await pending.work;
    expect(f.stages.captureHandoff()).toBeUndefined();
    const reopened = deferred<{ owner: IsolatedWiFiProvOwner; info: BlinkerConfigInfo }>(); f.ports.reopen.mockReturnValueOnce(reopened.promise);
    const read = vi.fn(async () => 'read'), work = tracked(f.stages.local(read)); await turn();
    const handoff = f.stages.captureHandoff()!; expect(handoff.stage).toBe('local');
    expect(f.ports.close).toHaveBeenCalledOnce(); expect(read).not.toHaveBeenCalled();
    f.stages.continue(); await turn(); expect(f.stages.state).toBe('reconnecting'); expect(f.stages.captureHandoff()).toBeUndefined();
    reopened.resolve({ owner: owner(sessionB), info: f.info }); await work;
    expect(f.stages.state).toBe('local'); expect(f.stages.captureHandoff()).toBeUndefined();
  });

  it('keeps detached deeply immutable public facts and rejects cloned, serialized or forged imports', async () => {
    const f = setup(), raw = await baseline(f), work = tracked(f.stages.prepareCloud()); await turn();
    const handoff = f.stages.captureHandoff()!; raw.fill(9); f.original.session = sessionB;
    expect(handoff.info.deviceInstanceIdHex).toBe('01'.repeat(16)); expect(handoff.previousOwner.session).toBe(sessionA);
    expect(Object.isFrozen(handoff)).toBe(true); expect(Object.isFrozen(handoff.info)).toBe(true); expect(Object.isFrozen(handoff.previousOwner)).toBe(true);
    expect(Reflect.set(handoff.info, 'accessEpoch', 99)).toBe(false); expect(Reflect.set(handoff.previousOwner, 'session', sessionB)).toBe(false);
    expect(Reflect.set(handoff, 'stage', 'local')).toBe(false);
    for (const forged of [{ ...handoff }, JSON.parse(JSON.stringify(handoff)), Object.freeze({ stage: 'cloud', previousOwner: owner(), info: handoff.info })]) {
      expect(() => consumeWiFiProvSoftApHandoff(forged, owner(sessionB), f.info)).toThrowError(expect.objectContaining({ code: 'WIFIPROV_HANDOFF_INVALID' }));
    }
    consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info);
    f.stages.cancel(); await expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
  });

  it.each(['instance', 'epoch', 'key', 'access', 'bootstrap', 'same-owner', 'invalid-owner'])('does not consume a %s mismatch before a later exact match', async change => {
    const f = setup(), { handoff } = await waiting(f);
    const fresh = { ...f.info, deviceInstanceId: f.info.deviceInstanceId.slice() }, next = owner(sessionB);
    if (change === 'instance') fresh.deviceInstanceId[0] = 2;
    if (change === 'epoch') fresh.accessEpoch++;
    if (change === 'key') fresh.hasDeviceKey = false;
    if (change === 'access') fresh.hasAccessState = false;
    if (change === 'bootstrap') fresh.supportsAccessBootstrap = false;
    if (change === 'same-owner') next.session = sessionA;
    if (change === 'invalid-owner') next.session = 'invalid';
    expect(() => consumeWiFiProvSoftApHandoff(handoff, next, fresh)).toThrow();
    consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info);
    expect(() => consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), f.info))
      .toThrowError(expect.objectContaining({ code: 'WIFIPROV_HANDOFF_CONSUMED' }));
  });

  it('never exports after rejected close, late close following cancellation, or account invalidation', async () => {
    const f = setup(); await baseline(f); f.ports.close.mockRejectedValueOnce(Error('unconfirmed close'));
    await expect(f.stages.prepareCloud()).rejects.toThrow('unconfirmed close'); expect(f.stages.captureHandoff()).toBeUndefined();
    const late = setup(); await baseline(late); const close = deferred<void>(); late.ports.close.mockReturnValueOnce(close.promise);
    const work = tracked(late.stages.prepareCloud()); await turn(); late.stages.cancel();
    await expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' }); close.resolve(); await turn();
    expect(late.stages.captureHandoff()).toBeUndefined(); expect(late.ports.assertCloud).not.toHaveBeenCalled();
    const changed = setup(); await waiting(changed); changed.ports.assertCurrent.mockImplementation(() => { throw Error('account changed'); });
    expect(changed.stages.captureHandoff()).toBeUndefined();
  });

  it('uses the optional context-only guard for capture, never for real work or continuation', async () => {
    const f = setup(), context = vi.fn(); await baseline(f);
    const work = tracked(f.stages.prepareCloud()); await turn();
    Object.assign(f.ports, { assertHandoffContext: context });
    const background = Error('foreground unavailable');
    f.ports.assertCurrent.mockImplementation(() => { throw background; });
    const handoff = f.stages.captureHandoff(); expect(handoff?.stage).toBe('cloud'); expect(context).toHaveBeenCalledOnce();
    f.stages.continue(); await expect(work).rejects.toBe(background);
    expect(f.ports.assertCloud).not.toHaveBeenCalled(); expect(f.ports.reopen).not.toHaveBeenCalled();

    const invalid = setup(); await waiting(invalid); const invalidContext = vi.fn(() => { throw Error('account changed'); });
    Object.assign(invalid.ports, { assertHandoffContext: invalidContext });
    expect(invalid.stages.captureHandoff()).toBeUndefined(); expect(invalidContext).toHaveBeenCalledOnce();
  });

  it.each(['zero-instance', 'epoch-without-access', 'access-without-epoch'])('rejects checkpoint-only nonphysical %s facts without changing the parser', async change => {
    const malformed = rawInfo();
    if (change === 'zero-instance') malformed.fill(0, 4, 20);
    if (change === 'epoch-without-access') malformed[3] &= ~4;
    if (change === 'access-without-epoch') new DataView(malformed.buffer).setUint32(20, 0, false);
    const malformedInfo = decodeBlinkerConfigInfo(malformed), invalid = setup();
    await invalid.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), async () => malformed);
    tracked(invalid.stages.prepareCloud()); await turn();
    expect(invalid.stages.state).toBe('await-cloud'); expect(invalid.stages.captureHandoff()).toBeUndefined();

    const valid = setup(), { handoff } = await waiting(valid);
    expect(() => consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), malformedInfo))
      .toThrowError(expect.objectContaining({ code: 'WIFIPROV_DEVICE_CONTEXT_REQUIRED' }));
    consumeWiFiProvSoftApHandoff(handoff, owner(sessionB), valid.info);
  });

  it('cannot export an inflight opaque request or convert cancellation/UNKNOWN into a handoff', async () => {
    const f = setup(), response = deferred<Uint8Array>(), sent = vi.fn(() => response.promise);
    const work = tracked(f.stages.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(), sent)); await turn();
    expect(f.stages.captureHandoff()).toBeUndefined(); f.stages.cancel();
    await expect(work).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    response.resolve(rawInfo()); await turn(); expect(f.stages.captureHandoff()).toBeUndefined(); expect(sent).toHaveBeenCalledOnce();
    const unknown = setup(); await baseline(unknown);
    await expect(unknown.stages.local(async () => { throw Object.assign(Error('unknown'), { code: 'PROVISIONING_RESULT_UNKNOWN' }); }, true))
      .rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    expect(unknown.stages.captureHandoff()).toBeUndefined(); expect(unknown.ports.close).not.toHaveBeenCalled();
  });

  it('exports no secret, transport work, Promise, fingerprint or alleged cryptographic root proof', async () => {
    const f = setup(), { handoff } = await waiting(f);
    expect(Object.keys(handoff).sort()).toEqual(['info', 'previousOwner', 'stage']);
    expect(Object.keys(handoff.info).sort()).toEqual(['accessEpoch', 'deviceInstanceIdHex', 'hasAccessState', 'hasDeviceKey', 'supportsAccessBootstrap']);
    const encoded = JSON.stringify(handoff);
    for (const field of ['deviceKey', 'controllerSecret', 'payload', 'promise', 'root', 'fingerprint', 'callback']) expect(encoded).not.toContain(field);
    expect(handoff).not.toHaveProperty('then'); expect(f.ports.reopen).not.toHaveBeenCalled();
  });
});
