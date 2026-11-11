import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {
  keys: vi.fn(async () => [...values.keys()]), getItem: vi.fn(async (key: string) => values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { values.delete(key); }),
} }));
vi.mock('../../injectable/server.interceptor', async () => {
  const { HttpContextToken } = await import('@angular/common/http');
  return { GATEWAY_NO_AUTH_REPLAY: new HttpContextToken(() => false) };
});
import { API, isGatewayUrl } from '../../../configs/api.config';
import { GATEWAY_NO_AUTH_REPLAY } from '../../injectable/server.interceptor';
import { HttpAccessRegistrationApi } from './access-registration-api';
import { AccessRegistrationIntent } from './access-registration-contract';
import { SecureAccessRegistrationCheckpoints, snapshotCheckpoint } from './access-registration-checkpoints';
import { AccessRegistrationCoordinator } from './access-registration-coordinator';
import { base64UrlEncode } from './wire';
import { GatewayHttpError } from '../../model/response.model';

const b64 = (length: number, byte: number) => base64UrlEncode(new Uint8Array(length).fill(byte));
const scope = { authority: 'https://fixture.invalid', accountId: 'owner' };
const root = { deviceInstanceId: b64(16, 1), accessEpoch: 1, controllerId: b64(16, 2),
  credentialVersion: 1 as const, adminFingerprint: b64(32, 3), cloudCredentialVersion: 1 };
const source = 'device_11111111-1111-4111-8111-111111111111', targetId = 'ble_AAECAwQFBgcICQoLDA0ODw';
function fixture(afterCommitted?: (...args: any[]) => Promise<void>) {
  const request = { requestId: b64(16, 4), sourceLogicalDeviceId: source,
    targetProduct: 'ble_direct' as const, name: 'Fixture card', expectedRoot: { ...root } };
  const intent: AccessRegistrationIntent = { intentId: request.requestId, sourceLogicalDeviceId: source,
    targetLogicalDeviceId: targetId, registrationProduct: 'ble_direct', rootBindingId: b64(16, 5), bindingRevision: 1,
    expectedRoot: { ...root }, clientNonce: b64(16, 6), expiresAt: Date.now() + 120000,
    state: 'prepared', quotaState: 'reserved', replayed: false };
  const committed: AccessRegistrationIntent = { ...intent, state: 'committed', quotaState: 'consumed',
    device: { logicalDeviceId: targetId, state: 'active' } };
  const api = { prepare: vi.fn(async () => intent), read: vi.fn(async () => committed),
    commit: vi.fn(async () => committed), cancel: vi.fn(async () => ({ ...intent,
      state: 'cancelled' as const, quotaState: 'released' as const })) };
  const references = { prepareAccessRegistrationReference: vi.fn(async () => undefined),
    confirmAccessRegistrationReference: vi.fn(async () => undefined),
    retireAccessRegistrationReference: vi.fn(async () => undefined), invalidateRootReferences: vi.fn(async () => [source, targetId]) };
  const session = { close: vi.fn(async () => undefined) };
  const client = { authenticateAccessRegistration: vi.fn(async () => ({ session, confirmationDigest: b64(32, 7) })) };
  let current = true;
  const assertCurrent = () => { if (!current) throw Error('CONTEXT_RETIRED'); };
  const checkpoints = new SecureAccessRegistrationCheckpoints(() => scope);
  const coordinator = new AccessRegistrationCoordinator(api, references, client as any, checkpoints, assertCurrent,
    undefined, afterCommitted);
  const signal = new AbortController().signal;
  return { request, intent, committed, api, references, client, session, checkpoints, coordinator, signal,
    retireContext: () => { current = false; }, target: {} as any };
}
const response = (data: AccessRegistrationIntent, noStore = true) => new HttpResponse({ status: 200,
  headers: new HttpHeaders(noStore ? { 'Cache-Control': 'private, no-store' } : {}), body: { status: 200, data } });

describe('registration account HTTP and checkpoints', () => {
  beforeEach(() => { values.clear(); vi.clearAllMocks(); });
  it('uses only four precise account routes with no-auth-replay and closed non-secret JSON', async () => {
    const f = fixture(), http = { request: vi.fn(() => of(response(f.intent))) };
    const api = new HttpAccessRegistrationApi(http as any);
    await api.prepare({ ...f.request, token: 'do-not-project', expectedRoot: { ...root, secret: 'do-not-project' } } as any, f.signal);
    const [method, url, options] = http.request.mock.calls[0] as any;
    expect(method).toBe('POST'); expect(url).toBe(API.DEVICE_V2.ACCESS_REGISTRATION_INTENTS);
    expect(options.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(options.body).toEqual(f.request); expect(JSON.stringify(options)).not.toContain('do-not-project');
    await api.read(f.intent.intentId, f.signal);
    http.request.mockReturnValueOnce(of(response(f.committed)));
    await api.commit(f.intent, b64(16, 8), b64(32, 7), f.signal);
    expect((http.request.mock.calls[2] as any)[2].body).toEqual({ commitId: b64(16, 8),
      method2Confirmed: true, clientNonce: f.intent.clientNonce, confirmationDigest: b64(32, 7) });
    http.request.mockReturnValueOnce(of(response(await f.api.cancel())));
    await api.cancel(f.intent.intentId, f.signal);
    expect(http.request.mock.calls.map((value: any) => value[1])).toEqual([
      API.DEVICE_V2.ACCESS_REGISTRATION_INTENTS, API.DEVICE_V2.ACCESS_REGISTRATION_INTENT(f.intent.intentId),
      API.DEVICE_V2.ACCESS_REGISTRATION_COMMIT(f.intent.intentId), API.DEVICE_V2.ACCESS_REGISTRATION_CANCEL(f.intent.intentId)]);
    for (const url of http.request.mock.calls.map((value: any) => value[1])) expect(isGatewayUrl(url)).toBe(true);
    for (const suffix of ['/arbitrary', '/commit/extra', '?token=x', '#x'])
      expect(isGatewayUrl(API.DEVICE_V2.ACCESS_REGISTRATION_INTENT(f.intent.intentId) + suffix)).toBe(false);
  });
  it('rejects a cacheable or miscorrelated response, and cancellation unsubscribes without retry', async () => {
    const f = fixture(), http = { request: vi.fn(() => of(response(f.intent, false))) }, api = new HttpAccessRegistrationApi(http as any);
    await expect(api.read(f.intent.intentId, f.signal)).rejects.toThrow('RESPONSE_INVALID');
    http.request.mockReturnValueOnce(of(response({ ...f.intent, intentId: b64(16, 9) })));
    await expect(api.read(f.intent.intentId, f.signal)).rejects.toThrow('CONTEXT_INVALID');
    const unsubscribed = vi.fn(), pending = { request: vi.fn(() => new Observable(() => unsubscribed)) };
    const cancel = new AbortController();
    const running = new HttpAccessRegistrationApi(pending as any).read(f.intent.intentId, cancel.signal);
    const failed = expect(running).rejects.toThrow(); cancel.abort(); await failed;
    expect(unsubscribed).toHaveBeenCalledOnce(); expect(pending.request).toHaveBeenCalledOnce();
  });
  it('persists only whitelisted metadata within the account and never evicts UNKNOWN for capacity', async () => {
    const f = fixture(), secret = 'never-store';
    const checkpoint = { request: { ...f.request, token: secret }, commitId: b64(16, 8), phase: 'unknown' as const,
      intent: { ...f.intent, controllerSecret: secret }, unknownOperation: 'commit' as const, secret };
    await f.checkpoints.save(checkpoint);
    expect([...values.values()].join('')).not.toContain(secret);
    await expect(f.checkpoints.removeTerminal(f.request.requestId)).rejects.toThrow('RECOVERY_REQUIRED');
    const other = new SecureAccessRegistrationCheckpoints(() => ({ ...scope, accountId: 'other' }));
    expect(await other.load(f.request.requestId)).toBeUndefined();
    for (let index = 10; index < 41; index++) await f.checkpoints.save({ ...checkpoint,
      request: { ...f.request, requestId: b64(16, index) }, intent: undefined });
    await expect(f.checkpoints.save({ ...checkpoint, request: { ...f.request, requestId: b64(16, 42) }, intent: undefined }))
      .rejects.toThrow('CHECKPOINT_LIMIT');
    expect((await f.checkpoints.load(f.request.requestId))?.unknownOperation).toBe('commit');
  });
  it('explicit terminal cleanup retains unresolved local work, and never touches the request journal', async () => {
    const f = fixture(), journalKey = 'request_journal_fixture'; values.set(journalKey, 'preserved');
    await f.checkpoints.save({ request: f.request, commitId: b64(16, 8), phase: 'committed', intent: f.committed,
      localReferencePending: true });
    await expect(f.checkpoints.removeTerminal(f.request.requestId)).rejects.toThrow('RECOVERY_REQUIRED');
    await f.checkpoints.save({ request: f.request, commitId: b64(16, 8), phase: 'committed', intent: f.committed,
      localReferencePending: false });
    await f.checkpoints.removeTerminal(f.request.requestId);
    expect(await f.checkpoints.load(f.request.requestId)).toBeUndefined(); expect(values.get(journalKey)).toBe('preserved');
  });
  it('refuses a damaged terminal phase without a matching authoritative terminal intent', async () => {
    const f = fixture();
    for (const value of [
      { phase: 'committed' as const, intent: f.intent },
      { phase: 'closed' as const, intent: f.intent },
      { phase: 'closed' as const, intent: undefined },
    ]) {
      await f.checkpoints.save({ request: f.request, commitId: b64(16, 8), ...value, localReferencePending: false });
      await expect(f.checkpoints.removeTerminal(f.request.requestId)).rejects.toThrow('RECOVERY_REQUIRED');
      expect(await f.checkpoints.load(f.request.requestId)).toBeDefined();
    }
  });
  it('strictly validates the one rejected prepare terminal tuple and preserves the original request journal', async () => {
    const f = fixture(), rejection = { httpStatus: 409 as const, code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING' as const };
    const terminal = { request: f.request, commitId: b64(16, 8), phase: 'rejected' as const,
      prepareRejection: rejection, localReferencePending: false };
    values.set('request_journal_fixture', 'preserved');
    await f.checkpoints.save(terminal);
    expect(await f.checkpoints.load(f.request.requestId)).toEqual(terminal);
    for (const changes of [{ prepareRejection: undefined }, { prepareRejection: { ...rejection, httpStatus: 503 } },
      { prepareRejection: { ...rejection, code: 'ROOT_CONTEXT_CHANGED' } },
      { prepareRejection: { ...rejection, extra: 'not-accepted' } }, { localReferencePending: true },
      { prepareRejection: Object.assign(Object.create(rejection), { extra: 1, other: 2 }) },
      { localReferencePending: undefined }, { unknownOperation: 'prepare' }, { confirmationDigest: b64(32, 9) },
      { intent: f.intent }, { phase: 'unknown' }])
      expect(() => snapshotCheckpoint({ ...terminal, ...changes } as any)).toThrow('CHECKPOINT_CORRUPT');
    await f.checkpoints.removeTerminal(f.request.requestId);
    expect(await f.checkpoints.load(f.request.requestId)).toBeUndefined();
    expect(values.get('request_journal_fixture')).toBe('preserved');
  });
});

describe('registration explicit coordinator ports', () => {
  beforeEach(() => { values.clear(); vi.clearAllMocks(); });
  it('persists the local root references before fresh authentication and confirms only after commit', async () => {
    const f = fixture(), order: string[] = [];
    f.references.prepareAccessRegistrationReference.mockImplementation(async () => { order.push('local-pending'); });
    f.client.authenticateAccessRegistration.mockImplementation(async () => { order.push('new-auth'); return { session: f.session, confirmationDigest: b64(32, 7) }; });
    f.api.commit.mockImplementation(async () => { order.push('commit'); return f.committed; });
    f.references.confirmAccessRegistrationReference.mockImplementation(async () => { order.push('active'); });
    expect((await f.coordinator.begin(f.request, f.target, f.signal)).localReferencePending).toBe(false);
    expect(order).toEqual(['local-pending', 'new-auth', 'commit', 'active']);
    expect(f.session.close).toHaveBeenCalledOnce(); expect((await f.checkpoints.load(f.request.requestId))?.phase).toBe('committed');
  });
  it('records only an exact pre-intent pending-root 409 as rejected, without fabricating an intent or recovery read', async () => {
    const f = fixture(), failure = new GatewayHttpError({ httpStatus: 409,
      code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING', message: 'Complete the existing presence operation first' });
    f.api.prepare.mockRejectedValueOnce(failure);
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toBe(failure);
    expect(await f.checkpoints.load(f.request.requestId)).toEqual({ request: f.request, commitId: expect.any(String),
      phase: 'rejected', localReferencePending: false, prepareRejection: {
        httpStatus: 409, code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING' } });
    await expect(f.coordinator.recover(f.request.requestId, f.signal)).rejects.toThrow('PREPARE_REJECTED');
    expect(f.api.read).not.toHaveBeenCalled(); expect(f.client.authenticateAccessRegistration).not.toHaveBeenCalled();
    expect(f.api.commit).not.toHaveBeenCalled(); expect(f.references.prepareAccessRegistrationReference).not.toHaveBeenCalled();
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow('RECOVERY_REQUIRED');
    expect(f.api.prepare).toHaveBeenCalledOnce();
  });
  it.each([
    [404, 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING'], [503, 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING'],
    [409, 'ROOT_CONTEXT_CHANGED'], [404, 'ACCESS_REGISTRATION_NOT_FOUND'],
  ])('keeps prepare HTTP %s / %s uncertain rather than broadening the narrow rejection', async (httpStatus, code) => {
    const f = fixture(); f.api.prepare.mockRejectedValueOnce(new GatewayHttpError({ httpStatus, code, message: 'Fixture failure' }));
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow('Fixture failure');
    const before = await f.checkpoints.load(f.request.requestId);
    expect(before?.phase).toBe('unknown'); expect(before?.unknownOperation).toBe('prepare');
    expect(before?.prepareRejection).toBeUndefined();
    f.api.read.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 404,
      code: 'ACCESS_REGISTRATION_NOT_FOUND', message: 'Missing request' }));
    await expect(f.coordinator.recover(f.request.requestId, f.signal)).rejects.toThrow('Missing request');
    expect(await f.checkpoints.load(f.request.requestId)).toEqual(before);
    await expect(f.coordinator.clearResolved(f.request.requestId, f.signal)).rejects.toThrow('RECOVERY_REQUIRED');
    expect(f.api.prepare).toHaveBeenCalledOnce();
  });
  it.each([Error('TIMEOUT'), { name: 'GatewayHttpError', httpStatus: 409,
    code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING' }])('keeps transport failures and look-alike objects as UNKNOWN', async failure => {
    const f = fixture(); f.api.prepare.mockRejectedValueOnce(failure);
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toBe(failure);
    expect((await f.checkpoints.load(f.request.requestId))?.phase).toBe('unknown');
    expect((await f.checkpoints.load(f.request.requestId))?.prepareRejection).toBeUndefined();
  });
  it('keeps the same pending-root 409 UNKNOWN when it occurs at commit after a prepared intent exists', async () => {
    const f = fixture(); f.api.commit.mockRejectedValueOnce(new GatewayHttpError({ httpStatus: 409,
      code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING', message: 'Concurrent root operation' }));
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow('Concurrent root operation');
    const record = await f.checkpoints.load(f.request.requestId);
    expect(record?.phase).toBe('unknown'); expect(record?.unknownOperation).toBe('commit');
    expect(record?.intent?.state).toBe('prepared'); expect(record?.prepareRejection).toBeUndefined();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it('initializes presence only after settled commit and before closing this fresh Method2 session', async () => {
    const order: string[] = [], setup = vi.fn(async () => { order.push('presence'); });
    const f = fixture(setup);
    f.references.confirmAccessRegistrationReference.mockImplementation(async () => { order.push('local-confirmed'); });
    f.session.close.mockImplementation(async () => { order.push('close'); });
    const result = await f.coordinator.begin(f.request, f.target, f.signal);
    expect(result).toEqual({ intent: f.committed, localReferencePending: false });
    expect(order).toEqual(['local-confirmed', 'presence', 'close']);
    expect(setup).toHaveBeenCalledExactlyOnceWith(f.committed, f.session, f.signal);
  });
  it('keeps the confirmed registration when its one presence setup fails', async () => {
    const setup = vi.fn(async () => { throw Error('RECEIPT_UNKNOWN'); }), f = fixture(setup);
    const result = await f.coordinator.begin(f.request, f.target, f.signal);
    expect(result).toEqual({ intent: f.committed, localReferencePending: false, presenceSetupPending: true });
    expect(f.api.commit).toHaveBeenCalledOnce(); expect(setup).toHaveBeenCalledOnce();
    expect(f.session.close).toHaveBeenCalledOnce();
    expect((await f.checkpoints.load(f.request.requestId))?.phase).toBe('committed');
    expect((await f.checkpoints.load(f.request.requestId))?.localReferencePending).toBe(false);
  });
  it('never initializes presence if local activation remains pending or the committed card was deleted', async () => {
    const setup = vi.fn(async () => undefined), f = fixture(setup);
    f.references.confirmAccessRegistrationReference.mockRejectedValueOnce(Error('STORAGE_FAILED'));
    expect((await f.coordinator.begin(f.request, f.target, f.signal)).localReferencePending).toBe(true);
    expect(setup).not.toHaveBeenCalled();
    values.clear(); const removed = fixture(setup);
    removed.api.commit.mockResolvedValueOnce({ ...removed.committed, device: { logicalDeviceId: targetId, state: 'deleted' } });
    expect((await removed.coordinator.begin(removed.request, removed.target, removed.signal)).intent.state).toBe('committed');
    expect(setup).not.toHaveBeenCalled();
  });
  it('HTTP-only recovery never opens a session or repairs pending presence', async () => {
    const setup = vi.fn(async () => { throw Error('RECEIPT_UNKNOWN'); }), f = fixture(setup);
    await f.coordinator.begin(f.request, f.target, f.signal);
    setup.mockClear(); f.client.authenticateAccessRegistration.mockClear(); f.api.commit.mockClear();
    await f.coordinator.recover(f.request.requestId, f.signal);
    expect(f.api.read).toHaveBeenCalledOnce(); expect(setup).not.toHaveBeenCalled();
    expect(f.client.authenticateAccessRegistration).not.toHaveBeenCalled(); expect(f.api.commit).not.toHaveBeenCalled();
  });
  it('closes the fresh session when context retirement interrupts presence without undoing commit', async () => {
    let f: ReturnType<typeof fixture>;
    const setup = vi.fn(async () => { f.retireContext(); throw Error('CANCELLED'); }); f = fixture(setup);
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow('CONTEXT_RETIRED');
    expect(f.api.commit).toHaveBeenCalledOnce(); expect(f.session.close).toHaveBeenCalledOnce();
    expect((await f.checkpoints.load(f.request.requestId))?.phase).toBe('committed');
  });
  it('retains an unknown commit and recovers with GET only, never authenticating or committing again', async () => {
    const f = fixture(); f.api.commit.mockRejectedValueOnce(Error('CONNECTION_LOST'));
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow('CONNECTION_LOST');
    expect((await f.checkpoints.load(f.request.requestId))?.phase).toBe('unknown');
    await expect(f.coordinator.resumePrepared(f.request.requestId, f.target, f.signal)).rejects.toThrow('RECOVERY_REQUIRED');
    expect((await f.coordinator.recover(f.request.requestId, f.signal)).localReferencePending).toBe(false);
    expect(f.api.prepare).toHaveBeenCalledOnce(); expect(f.api.commit).toHaveBeenCalledOnce();
    expect(f.client.authenticateAccessRegistration).toHaveBeenCalledOnce(); expect(f.api.read).toHaveBeenCalledOnce();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it('does not retract a confirmed server result when local activation fails', async () => {
    const f = fixture(); f.references.confirmAccessRegistrationReference.mockRejectedValueOnce(Error('STORAGE_FAILED'));
    const result = await f.coordinator.begin(f.request, f.target, f.signal);
    expect(result.intent.state).toBe('committed'); expect(result.localReferencePending).toBe(true);
    expect((await f.checkpoints.load(f.request.requestId))?.phase).toBe('committed');
  });
  it('retired context closes a late authentication without sending commit or activating the target', async () => {
    const f = fixture();
    f.client.authenticateAccessRegistration.mockImplementation(async () => {
      f.retireContext(); return { session: f.session, confirmationDigest: b64(32, 7) };
    });
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow('CONTEXT_RETIRED');
    expect(f.api.commit).not.toHaveBeenCalled(); expect(f.references.confirmAccessRegistrationReference).not.toHaveBeenCalled();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it('uses authoritative terminal coordination to retire only the matching intent reference', async () => {
    const f = fixture(); f.api.commit.mockRejectedValueOnce(Error('CONNECTION_LOST'));
    await expect(f.coordinator.begin(f.request, f.target, f.signal)).rejects.toThrow();
    f.api.read.mockResolvedValueOnce({ ...f.committed, device: { logicalDeviceId: targetId, state: 'deleted' } });
    await f.coordinator.recover(f.request.requestId, f.signal);
    expect(f.references.retireAccessRegistrationReference).toHaveBeenCalledWith(targetId, f.intent.intentId);
    expect(f.references.confirmAccessRegistrationReference).not.toHaveBeenCalled();
  });
  it('invalidated read coordination fences every root reference before retiring the target and allowing explicit cleanup', async () => {
    const f = fixture(), order: string[] = [];
    await f.checkpoints.save({ request: f.request, commitId: b64(16, 8), phase: 'unknown',
      unknownOperation: 'commit', intent: f.intent });
    f.api.read.mockResolvedValueOnce({ ...f.intent, state: 'invalidated', quotaState: 'released' });
    f.references.invalidateRootReferences.mockImplementation(async () => { order.push('invalidate-root'); return [source, targetId]; });
    f.references.retireAccessRegistrationReference.mockImplementation(async () => { order.push('retire-target'); });
    await f.coordinator.recover(f.request.requestId, f.signal);
    expect(order).toEqual(['invalidate-root', 'retire-target']); expect(f.api.commit).not.toHaveBeenCalled();
    expect((await f.checkpoints.load(f.request.requestId))?.localReferencePending).toBe(false);
    await f.coordinator.clearResolved(f.request.requestId, f.signal);
    expect(await f.checkpoints.load(f.request.requestId)).toBeUndefined();
  });
});
