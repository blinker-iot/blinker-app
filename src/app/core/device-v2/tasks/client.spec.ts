import '@angular/compiler';
import { of, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { base64UrlEncode } from '../base64url';
import { DeviceTaskClient, HttpTaskApi, TaskApi } from './client';
import { TaskRequest, TaskResponse, taskRequest, taskResponse } from './contract';

const id = 'device_a', requestId = base64UrlEncode(new Uint8Array(16).fill(1));
const start = { operation: 'start' as const, taskId: 1, expectedRevision: 2 };
const catalogHash = base64UrlEncode(new Uint8Array(32).fill(8));
function response(request: TaskRequest, historical = false): TaskResponse {
  return { contract: 'device-tasks/1', logicalDeviceId: id, requestId: request.requestId, state: 'verified',
    evidence: historical ? 'historical' : 'fresh', result: historical ? null
      : request.operation === 'initialize' ? { kind: 'authority', tableRevision: 0, count: 0 }
        : request.operation === 'read' ? { kind: 'metadata', tableRevision: 3, count: 1 }
          : request.operation === 'catalog' ? request.index === null
            ? { kind: 'catalog', tableRevision: 3, count: 1, capacity: 4, total: 2, fingerprint: catalogHash }
            : { kind: 'target', tableRevision: 3, count: 1, capacity: 4, total: 2, fingerprint: catalogHash,
                index: request.index, key: request.index === 0 ? 'power' : 'level', valueType: request.index === 0 ? 'boolean' : 'uint' }
          : { kind: 'mutation', tableRevision: request.expectedRevision + 1, count: 1, taskId: 1, replayed: false } };
}
function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  const account = { accountId: 'owner', authority: API.BASE_URL, sessionEpoch: 1 };
  const execute = vi.fn<TaskApi['execute']>(async (_, r) => response(r));
  let sequence = 1;
  const create = () => new DeviceTaskClient({ execute }, storage, () => account, () => new Uint8Array(16).fill(sequence++));
  return { data, storage, account, execute, create, client: create() };
}
describe('typed task boundary', () => {
  it('only a correlated fresh mutation refusal produces a known attempt error', () => {
    const request = taskRequest({ contract: 'device-tasks/1', requestId, ...start });
    const rejected = { ...response(request), state: 'rejected',
      result: { kind: 'rejection', tableRevision: 2, count: 1, reason: 'write-budget' } };
    expect(() => taskResponse(rejected, id, request)).toThrow('TASK_ATTEMPT_WRITE_BUDGET');
    expect(() => taskResponse({ ...rejected, result: { ...rejected.result, reason: 'start-cooldown' } }, id, request)).toThrow('TASK_ATTEMPT_START_COOLDOWN');
    for (const patch of [{ evidence: 'historical' }, { requestId: 'AgICAgICAgICAgICAgICAg' }, { logicalDeviceId: 'device_b' },
      { result: { ...rejected.result, reason: 'busy' } }, { result: { ...rejected.result, retryAfter: 1 } },
      { result: { ...rejected.result, tableRevision: 3 } }])
      expect(() => taskResponse({ ...rejected, ...patch }, id, request)).toThrow('TASK_CONTRACT_INVALID');
    for (const operation of ['initialize', 'read', 'catalog'] as const)
      expect(() => taskResponse(rejected, id, taskRequest({ contract: 'device-tasks/1', requestId, operation,
        ...(operation === 'read' ? { expectedRevision: 0, index: null } : operation === 'catalog' ? { index: null, fingerprint: null } : {}) })))
        .toThrow('TASK_CONTRACT_INVALID');
  });
  it('snapshots exact operations and rejects authority injection/old loop/action JSON', () => {
    const input = { contract: 'device-tasks/1', requestId, ...start };
    expect(taskRequest(input)).toEqual(input);
    for (const extra of [{ rootDigest: 'secret' }, { operation: 'loop' }, { expectedRevision: -1 }, { taskId: 0 }, { requestId: 'A'.repeat(22) }])
      expect(() => taskRequest({ ...input, ...extra })).toThrow();
    const create = { contract: 'device-tasks/1', requestId, operation: 'create', expectedRevision: 0,
      definition: { enabled: true, key: '温度', valueType: 'float32', value: 1.25, schedule: { kind: 'countdown', durationMillis: 1000 } } };
    const owned = taskRequest(create); create.definition.value = 4;
    expect('definition' in owned && owned.definition.value).toBe(1.25);
    expect(() => taskRequest({ ...create, definition: { ...create.definition, value: 0.1 } })).toThrow();
    expect(() => taskRequest({ ...create, definition: { ...create.definition, key: '\ud800' } })).toThrow();
  });
  it('keeps historical proof separate and rejects mismatched/oversized/injected results', () => {
    const request = taskRequest({ contract: 'device-tasks/1', requestId, ...start });
    expect(taskResponse(response(request, true), id, request).result).toBeNull();
    for (const extra of [{ requestId: 'AgICAgICAgICAgICAgICAg' }, { logicalDeviceId: 'device_b' }, { taskScope: 'private' },
      { result: { kind: 'mutation', tableRevision: 8, count: 1, taskId: 1, replayed: false } }])
      expect(() => taskResponse({ ...response(request), ...extra }, id, request)).toThrow();
  });
  it('accepts a correlated owned record and rejects a mixed revision/page or out-of-range record', () => {
    const request = taskRequest({ contract: 'device-tasks/1', requestId, operation: 'read', expectedRevision: 3, index: 0 });
    const record = { taskId: 1, definitionRevision: 2, consumedUtcMillis: 0, startSequence: 1, progress: 1,
      definition: { enabled: true, key: 'power', valueType: 'boolean', value: false, schedule: { kind: 'countdown', durationMillis: 3000 } } };
    const result = { kind: 'record', tableRevision: 3, count: 1, index: 0, record };
    const envelope = { ...response(request), result };
    const parsed = taskResponse(envelope, id, request); record.definition.value = true;
    expect(parsed.result?.kind === 'record' && parsed.result.record.definition.value).toBe(false);
    for (const patch of [{ index: 1 }, { tableRevision: 4 }, { count: 0 }, { record: { ...record, definitionRevision: 4 } }])
      expect(() => taskResponse({ ...envelope, result: { ...result, ...patch } }, id, request)).toThrow();
  });
});
describe('DeviceTaskClient intent journal', () => {
  it('preserves an earlier unknown write after authenticated refusal; only explicit same-ID recovery can settle it', async () => {
    const f = setup(); f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.submit(id, start)).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const original = await f.client.pending(id);
    const restored = f.create();
    for (const reason of ['write-budget', 'start-cooldown']) {
      f.execute.mockImplementationOnce(async (_, request) => ({ ...response(request), state: 'rejected',
        result: { kind: 'rejection', tableRevision: 2, count: 1, reason } }) as unknown as TaskResponse);
      await expect(restored.retry(id)).rejects.toThrow(reason === 'write-budget' ? 'TASK_ATTEMPT_WRITE_BUDGET' : 'TASK_ATTEMPT_START_COOLDOWN');
      expect(await restored.pending(id)).toEqual(original);
    }
    expect(f.execute).toHaveBeenCalledTimes(3);
    await expect(restored.submit(id, start)).rejects.toThrow('TASK_PENDING_INTENT');
    await restored.read(id); expect(await restored.pending(id)).toEqual(original);
    await restored.retry(id); expect(f.execute.mock.calls[4][1]).toEqual(original);
    expect(await restored.pending(id)).toBeUndefined();
  });
  it('keeps the exact unresolved write across offline/not-ready errors; only explicit retry can send it again', async () => {
    for (const code of ['TASK_DEVICE_OFFLINE', 'TASK_CONNECTION_NOT_READY', 'TASK_CONNECTION_CHANGED', 'TASK_CONNECTION_AMBIGUOUS']) {
      const f = setup(); f.execute.mockRejectedValueOnce({ error: { errorCode: code } });
      await expect(f.client.submit(id, start)).rejects.toMatchObject({ error: { errorCode: code } });
      const pending = await f.client.pending(id);
      expect(f.execute).toHaveBeenCalledTimes(1);
      const restored = f.create();
      expect(await restored.pending(id)).toEqual(pending);
      await restored.read(id);
      expect(await restored.pending(id)).toEqual(pending);
      await restored.retry(id);
      expect(f.execute.mock.calls[2][1]).toEqual(pending);
      expect(await restored.pending(id)).toBeUndefined();
    }
  });

  it('waits for durable storage, excludes concurrent writes and checks cancellation before network', async () => {
    const f = setup(), aborter = new AbortController();
    let commit!: () => void;
    const storage = { ...f.storage, setItem: (key: string, value: string) => new Promise<void>(resolve => {
      commit = () => { f.storage.setItem(key, value); resolve(); };
    }) };
    const client = new DeviceTaskClient({ execute: f.execute }, storage, () => f.account);
    const work = client.submit(id, start, aborter.signal);
    await vi.waitFor(() => expect(commit).toBeTypeOf('function'));
    expect(f.execute).not.toHaveBeenCalled();
    await expect(client.submit(id, start)).rejects.toThrow('TASK_BUSY');
    aborter.abort(); commit();
    await expect(work).rejects.toThrow(); expect(f.execute).not.toHaveBeenCalled();
    expect((await client.pending(id))?.operation).toBe('start');
  });
  it('rejects failed async commits and retains a verified intent when deletion fails', async () => {
    const f = setup(), storage = { ...f.storage, setItem: async () => { throw Error('commit failed'); } };
    const client = new DeviceTaskClient({ execute: f.execute }, storage, () => f.account);
    await expect(client.submit(id, start)).rejects.toThrow('commit failed'); expect(f.execute).not.toHaveBeenCalled();
    const g = setup(); g.storage.removeItem = () => { throw Error('delete failed'); };
    await expect(g.client.submit(id, start)).rejects.toThrow('delete failed');
    expect((await g.client.pending(id))?.operation).toBe('start');
  });
  it('reads a bounded authenticated catalog without clearing a pending write or inventing targets', async () => {
    const f = setup(); f.execute.mockRejectedValueOnce(new Error('offline'));
    await expect(f.client.submit(id, start)).rejects.toThrow(); const pending = await f.client.pending(id);
    expect(await f.client.catalog(id)).toEqual({ capacity: 4, fingerprint: catalogHash,
      targets: [{ key: 'power', valueType: 'boolean' }, { key: 'level', valueType: 'uint' }] });
    expect(await f.client.pending(id)).toEqual(pending);
    const queries = f.execute.mock.calls.slice(1).map(call => call[1]);
    expect(queries.map(q => q.operation)).toEqual(['catalog', 'catalog', 'catalog']);
    expect(new Set(queries.map(q => q.requestId)).size).toBe(3);
    expect(queries[1]).toMatchObject({ index: 0, fingerprint: catalogHash });
  });
  it('rejects mixed/duplicate catalog pages, historical evidence, cancellation and malformed selectors', async () => {
    for (const patch of [{ fingerprint: base64UrlEncode(new Uint8Array(32).fill(9)) }, { total: 3 }, { capacity: 8 }, { index: 8 }]) {
      const f = setup(); f.execute.mockImplementation(async (_, r) => {
        const answer = response(r);
        return r.operation === 'catalog' && r.index !== null ? { ...answer, result: { ...answer.result, ...patch } } as TaskResponse : answer;
      });
      await expect(f.client.catalog(id)).rejects.toThrow(); expect(f.data.size).toBe(0);
    }
    const duplicate = setup(); duplicate.execute.mockImplementation(async (_, r) => {
      const answer = response(r);
      if (answer.result?.kind === 'target') answer.result.key = 'power';
      return answer;
    });
    await expect(duplicate.client.catalog(id)).rejects.toThrow('TASK_CATALOG_INVALID');
    const historical = setup(); historical.execute.mockImplementation(async (_, r) => response(r, true));
    await expect(historical.client.catalog(id)).rejects.toThrow('TASK_CATALOG_UNAVAILABLE');
    const cancelled = setup(), aborter = new AbortController(); aborter.abort();
    await expect(cancelled.client.catalog(id, aborter.signal)).rejects.toThrow(); expect(cancelled.execute).not.toHaveBeenCalled();
    for (const patch of [{ index: 32 }, { fingerprint: null, index: 0 }, { fingerprint: catalogHash, index: null }, { expectedRevision: 2 }])
      expect(() => taskRequest({ contract: 'device-tasks/1', requestId, operation: 'catalog', fingerprint: catalogHash, index: 0, ...patch })).toThrow();
  });
  it('persists before I/O and recovers original ID/body after client recreation; no auto retry', async () => {
    const f = setup(); f.execute.mockImplementationOnce(async (_, r) => { expect(f.data.size).toBe(1); expect(await f.client.pending(id)).toEqual(r); throw new Error('TASK_OUTCOME_UNKNOWN'); });
    await expect(f.client.submit(id, start)).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const pending = await f.client.pending(id);
    expect(f.execute).toHaveBeenCalledTimes(1);
    await expect(f.create().submit(id, start)).rejects.toThrow('TASK_PENDING_INTENT');
    await f.create().retry(id);
    expect(f.execute.mock.calls[1][1]).toEqual(pending); expect(f.data.size).toBe(0);
  });
  it('history expiry and fresh read never change/clear an unknown Start', async () => {
    const f = setup(); f.execute.mockRejectedValueOnce(new Error('TASK_HISTORY_EXPIRED'));
    await expect(f.client.submit(id, start)).rejects.toThrow('TASK_HISTORY_EXPIRED');
    const pending = await f.client.pending(id); await f.client.read(id);
    expect(await f.client.pending(id)).toEqual(pending); expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.execute.mock.calls[1][1].operation).toBe('read');
  });
  it('account/session change cannot publish success or clear the prior account intent', async () => {
    const f = setup(); f.execute.mockImplementationOnce(async (_, r) => { f.account.accountId = 'other'; return response(r); });
    await expect(f.client.submit(id, start)).rejects.toThrow('TASK_ACCOUNT_CHANGED');
    expect(await f.client.pending(id)).toBeUndefined(); expect(f.data.size).toBe(1);
    f.account.accountId = 'owner'; expect((await f.client.pending(id))?.operation).toBe('start');
    f.execute.mockImplementationOnce(async (_, r) => { f.account.sessionEpoch++; return response(r); });
    await expect(f.client.retry(id)).rejects.toThrow('TASK_ACCOUNT_CHANGED'); expect(f.data.size).toBe(1);
  });
  it('storage failure/corruption blocks network rather than replacing pending intent', async () => {
    const f = setup(); f.storage.setItem = () => { throw new Error('quota'); };
    await expect(f.client.submit(id, start)).rejects.toThrow('quota'); expect(f.execute).not.toHaveBeenCalled();
    const g = setup(); g.execute.mockRejectedValueOnce(new Error('offline'));
    await expect(g.client.submit(id, start)).rejects.toThrow();
    g.data.set([...g.data.keys()][0], '{broken');
    await expect(g.create().submit(id, start)).rejects.toThrow(); expect(g.execute).toHaveBeenCalledTimes(1);
  });
  it('cancellation/concurrent retry preserve original intent, and exact historical success may settle it', async () => {
    const f = setup(), aborter = new AbortController();
    f.execute.mockImplementationOnce(async (_, r) => {
      await expect(f.client.retry(id)).rejects.toThrow('TASK_BUSY'); aborter.abort(); return response(r);
    });
    await expect(f.client.submit(id, start, aborter.signal)).rejects.toThrow(); expect(f.data.size).toBe(1);
    f.execute.mockImplementationOnce(async (_, r) => response(r, true));
    expect((await f.client.retry(id)).evidence).toBe('historical'); expect(f.data.size).toBe(0);
  });
  it('passes optional dispatch observations through submit, exact retry and authority sync without changing journal outcomes', async () => {
    const f = setup(), observed = vi.fn(() => { throw new Error('diagnostic failure'); });
    f.execute.mockImplementationOnce(async (_, _request, _signal, onDispatch) => {
      onDispatch?.(); throw new Error('TASK_OUTCOME_UNKNOWN');
    });
    await expect(f.client.submit(id, start, new AbortController().signal, observed)).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const pending = await f.client.pending(id); expect(observed).toHaveBeenCalledTimes(1);
    f.execute.mockImplementationOnce(async (_, request, _signal, onDispatch) => { onDispatch?.(); return response(request); });
    await f.client.retry(id, new AbortController().signal, observed);
    expect(f.execute.mock.calls.at(-1)![1]).toEqual(pending);
    expect(await f.client.pending(id)).toBeUndefined(); expect(observed).toHaveBeenCalledTimes(2);
    const g = setup(); g.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(g.client.submit(id, start)).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const original = await g.client.inspect(id);
    g.execute.mockImplementationOnce(async (_, request, _signal, onDispatch) => { onDispatch?.(); return response(request); });
    await g.client.synchronizeAuthority(id, original, new AbortController().signal, observed);
    expect(await g.client.inspect(id)).toEqual({ ...original, authority: undefined, held: true });
    expect(observed).toHaveBeenCalledTimes(3);
  });
});
describe('fresh metadata validated capability cache', () => {
  function catalogs() {
    const f = setup();
    const answer = (deviceId: string, request: TaskRequest) => ({ ...response(request), logicalDeviceId: deviceId });
    f.execute.mockImplementation(async (deviceId, request) => answer(deviceId, request));
    return { ...f, answer };
  }
  it('reuses only complete immutable targets after a new metadata transaction, never the task table or intent', async () => {
    const f = catalogs(), first = await f.client.catalog(id);
    expect(f.execute).toHaveBeenCalledTimes(3);
    expect(await f.client.catalog(id)).toBe(first);
    expect(f.execute).toHaveBeenCalledTimes(4);
    expect(f.execute.mock.calls.at(-1)![1]).toMatchObject({ operation: 'catalog', index: null, fingerprint: null });
    expect(Object.isFrozen(first)).toBe(true); expect(Object.isFrozen(first.targets)).toBe(true);
    expect(first.targets.every(Object.isFrozen)).toBe(true); expect(f.data.size).toBe(0);
    await f.client.read(id); await f.client.read(id);
    expect(f.execute).toHaveBeenCalledTimes(6);
  });
  it('refetches all targets when capacity, total or fingerprint changes', async () => {
    for (const patch of [{ capacity: 5 }, { total: 1 }, { fingerprint: base64UrlEncode(new Uint8Array(32).fill(9)) }]) {
      const f = catalogs(); await f.client.catalog(id); f.execute.mockClear();
      f.execute.mockImplementation(async (deviceId, request) => {
        const answer = f.answer(deviceId, request);
        if (answer.result?.kind === 'catalog' || answer.result?.kind === 'target') Object.assign(answer.result, patch);
        return answer;
      });
      const result = await f.client.catalog(id);
      expect(result).toMatchObject({ capacity: patch.capacity ?? 4, fingerprint: patch.fingerprint ?? catalogHash });
      expect(f.execute).toHaveBeenCalledTimes(1 + (patch.total ?? 2));
    }
  });
  it('drops failed metadata validation and never publishes partially collected pages', async () => {
    const f = catalogs(); await f.client.catalog(id); f.execute.mockRejectedValueOnce(new Error('offline'));
    await expect(f.client.catalog(id)).rejects.toThrow('offline'); f.execute.mockClear();
    await f.client.catalog(id); expect(f.execute).toHaveBeenCalledTimes(3);
    const g = catalogs();
    g.execute.mockImplementationOnce(async (deviceId, request) => g.answer(deviceId, request))
      .mockImplementationOnce(async (deviceId, request) => g.answer(deviceId, request))
      .mockRejectedValueOnce(new Error('page failed'));
    await expect(g.client.catalog(id)).rejects.toThrow('page failed'); g.execute.mockClear();
    await g.client.catalog(id); expect(g.execute).toHaveBeenCalledTimes(3);
  });
  it('rejects late cancellation on a cache hit and during pagination without retaining a fallback', async () => {
    for (const cached of [false, true]) {
      const f = catalogs(), aborter = new AbortController();
      if (cached) await f.client.catalog(id);
      f.execute.mockClear(); f.execute.mockImplementationOnce(async (deviceId, request) => {
        if (cached) aborter.abort();
        return f.answer(deviceId, request);
      });
      if (!cached) f.execute.mockImplementationOnce(async (deviceId, request) => {
        aborter.abort(); return f.answer(deviceId, request);
      });
      await expect(f.client.catalog(id, aborter.signal)).rejects.toThrow(); f.execute.mockClear();
      await f.client.catalog(id); expect(f.execute).toHaveBeenCalledTimes(3);
    }
  });
  it('rejects cancellation after fresh metadata settles but before a cached directory can be returned', async () => {
    const f = catalogs(), aborter = new AbortController();
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.submit(id, start)).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const pending = await f.client.pending(id); await f.client.catalog(id); f.execute.mockClear();
    const internals = f.client as unknown as {
      query(deviceId: string, intent: { operation: 'catalog'; fingerprint: string | null; index: number | null }, signal: AbortSignal): Promise<TaskResponse>;
    };
    const original = internals.query.bind(f.client), query = vi.spyOn(internals, 'query');
    query.mockImplementationOnce(async (...args) => {
      const metadata = await original(...args);
      queueMicrotask(() => aborter.abort()); return metadata;
    });
    await expect(f.client.catalog(id, aborter.signal)).rejects.toThrow();
    expect(f.execute).toHaveBeenCalledTimes(1); expect(await f.client.pending(id)).toEqual(pending);
    query.mockRestore(); f.execute.mockClear(); await f.client.catalog(id);
    expect(f.execute).toHaveBeenCalledTimes(3); expect(await f.client.pending(id)).toEqual(pending);
  });
  it('isolates account, authority and session transitions, including a late page from the previous account', async () => {
    const f = catalogs(), authorityDescriptor = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;
    try {
      await f.client.catalog(id);
      for (const update of [() => { f.account.accountId = 'other'; }, () => { ++f.account.sessionEpoch; },
        () => {
          Object.defineProperty(API, 'BASE_URL', { ...authorityDescriptor, value: 'https://another.example' });
          f.account.authority = API.BASE_URL;
        }]) {
        update(); f.execute.mockClear(); await f.client.catalog(id); expect(f.execute).toHaveBeenCalledTimes(3);
      }
    } finally { Object.defineProperty(API, 'BASE_URL', authorityDescriptor); }
    const g = catalogs();
    g.execute.mockImplementationOnce(async (deviceId, request) => g.answer(deviceId, request))
      .mockImplementationOnce(async (deviceId, request) => { g.account.accountId = 'other'; return g.answer(deviceId, request); });
    await expect(g.client.catalog(id)).rejects.toThrow('TASK_ACCOUNT_CHANGED'); g.execute.mockClear();
    await g.client.catalog(id); expect(g.execute).toHaveBeenCalledTimes(3);
  });
  it('bounds the complete-directory cache to eight LRU entries', async () => {
    const f = catalogs();
    for (let index = 0; index < 8; ++index) await f.client.catalog(`device_${index}`);
    f.execute.mockClear(); await f.client.catalog('device_0'); expect(f.execute).toHaveBeenCalledTimes(1);
    await f.client.catalog('device_8'); f.execute.mockClear();
    await f.client.catalog('device_0'); expect(f.execute).toHaveBeenCalledTimes(1);
    f.execute.mockClear(); await f.client.catalog('device_1'); expect(f.execute).toHaveBeenCalledTimes(3);
  });
  it('invalidates targets before authority I/O even on UNKNOWN, without releasing its durable intent', async () => {
    const f = catalogs(); await f.client.catalog(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.submit(id, { operation: 'initialize' })).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const pending = await f.client.pending(id); f.execute.mockClear();
    await f.client.catalog(id); expect(f.execute).toHaveBeenCalledTimes(3);
    expect(await f.client.pending(id)).toEqual(pending);
  });
  it('does not let a directory already in flight repopulate the cache after authority recovery', async () => {
    const f = catalogs(); let release!: () => void;
    f.execute.mockImplementation(async (deviceId, request) => {
      if (request.operation === 'catalog' && request.index === 0) await new Promise<void>(resolve => { release = resolve; });
      return f.answer(deviceId, request);
    });
    const work = f.client.catalog(id);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await f.client.submit('another_device', { operation: 'initialize' }); release(); await work;
    f.execute.mockImplementation(async (deviceId, request) => f.answer(deviceId, request)); f.execute.mockClear();
    await f.client.catalog(id); expect(f.execute).toHaveBeenCalledTimes(3);
  });
});

describe('HttpTaskApi', () => {
  it('paces sequential Prepare/Commit transactions and cancels a wait without sending HTTP', async () => {
    vi.useFakeTimers();
    try {
      const request = taskRequest({ contract: 'device-tasks/1', requestId, ...start });
      const post = vi.fn(() => of({ status: 200, headers: { get: () => 'no-store' }, body: { status: 200, data: response(request) } }));
      const api = new HttpTaskApi({ post } as any);
      await api.execute(id, request, new AbortController().signal);
      const observed = vi.fn(), aborter = new AbortController(), waiting = api.execute(id, request, aborter.signal, observed);
      const rejected = expect(waiting).rejects.toThrow();
      aborter.abort(); await rejected; expect(post).toHaveBeenCalledTimes(1); expect(observed).not.toHaveBeenCalled();
      const next = api.execute(id, request, new AbortController().signal, observed);
      await vi.advanceTimersByTimeAsync(549); expect(post).toHaveBeenCalledTimes(1); expect(observed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); await next; expect(post).toHaveBeenCalledTimes(2); expect(observed).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('uses existing authenticated Gateway resource, validates no-store and correlation, no raw device secret', async () => {
    const request = taskRequest({ contract: 'device-tasks/1', requestId, ...start });
    const post = vi.fn(() => of({ status: 200, headers: { get: (): string => 'private, no-store' }, body: { status: 200, data: response(request) } }));
    const api = new HttpTaskApi({ post } as unknown as ConstructorParameters<typeof HttpTaskApi>[0]);
    expect((await api.execute(id, request, new AbortController().signal)).evidence).toBe('fresh');
    expect(post.mock.calls[0]).toEqual([API.DEVICE_V2.TASKS(id), request, { observe: 'response' }]);
    post.mockReturnValue(of({ status: 200, headers: { get: () => '' }, body: { status: 200, data: response(request) } }));
    await expect(api.execute(id, request, new AbortController().signal)).rejects.toThrow('TASK_RESPONSE_INVALID');
  });
  it('abort unsubscribes HTTP work without a client retry', async () => {
    const subject = new Subject(), post = vi.fn(() => subject), aborter = new AbortController();
    const api = new HttpTaskApi({ post } as unknown as ConstructorParameters<typeof HttpTaskApi>[0]);
    const work = api.execute(id, taskRequest({ contract: 'device-tasks/1', requestId, ...start }), aborter.signal);
    expect(subject.observed).toBe(true); aborter.abort(); await expect(work).rejects.toThrow();
    expect(subject.observed).toBe(false); expect(post).toHaveBeenCalledTimes(1);
  });
  it('observes HTTP start before sending and ignores observation errors, without claiming device delivery', async () => {
    const request = taskRequest({ contract: 'device-tasks/1', requestId, ...start }), events: string[] = [];
    const post = vi.fn(() => {
      events.push('http');
      return of({ status: 200, headers: { get: () => 'no-store' }, body: { status: 200, data: response(request) } });
    });
    const api = new HttpTaskApi({ post } as unknown as ConstructorParameters<typeof HttpTaskApi>[0]);
    const result = await api.execute(id, request, new AbortController().signal, () => {
      events.push('observer'); throw new Error('diagnostic failure');
    });
    expect(result.evidence).toBe('fresh'); expect(events).toEqual(['observer', 'http']); expect(post).toHaveBeenCalledTimes(1);
  });
  it('does not subscribe HTTP after synchronous observation cancellation and preserves the committed intent', async () => {
    const f = setup(), aborter = new AbortController(), post = vi.fn(() => of());
    const api = new HttpTaskApi({ post } as unknown as ConstructorParameters<typeof HttpTaskApi>[0]);
    const client = new DeviceTaskClient(api, f.storage, () => f.account);
    await expect(client.submit(id, start, aborter.signal, () => aborter.abort())).rejects.toThrow();
    expect(post).not.toHaveBeenCalled(); expect((await client.pending(id))?.operation).toBe('start');
    expect(f.data.size).toBe(1);
  });
});

describe('bounded fresh task table', () => {
  const record = { taskId: 7, definitionRevision: 2, consumedUtcMillis: 0, startSequence: 0, progress: 0,
    definition: { enabled: true, key: 'power', valueType: 'boolean', value: false,
      schedule: { kind: 'countdown', durationMillis: 3000 } } };
  function pages(total = 1) {
    const f = setup();
    f.execute.mockImplementation(async (_, request) => {
      const r = response(request);
      if (request.operation === 'read') r.result = request.index === null ? { kind: 'metadata', tableRevision: 3, count: total }
        : { kind: 'record', tableRevision: 3, count: total, index: request.index, record: record as any };
      return r;
    });
    return f;
  }
  it('returns a complete fixed-revision table with real taskId, not page index', async () => {
    const f = pages(); expect(await f.client.table(id)).toEqual({ revision: 3, records: [record] });
    expect(f.execute.mock.calls[1][1]).toMatchObject({ expectedRevision: 3, index: 0 });
  });
  it('rejects duplicate IDs, mixed revisions, changed count and historical metadata without partial output', async () => {
    await expect(pages(2).client.table(id)).rejects.toThrow('TASK_TABLE_CHANGED');
    for (const change of [{ count: 2 }, { tableRevision: 4 }]) {
      const f = pages(), original = f.execute.getMockImplementation()!;
      f.execute.mockImplementation(async (...args) => {
        const r = await original(...args);
        if (r.result?.kind === 'record') Object.assign(r.result, change);
        return r;
      });
      await expect(f.client.table(id)).rejects.toThrow();
    }
    const f = pages(); f.execute.mockImplementationOnce(async (_, r) => response(r, true));
    await expect(f.client.table(id)).rejects.toThrow('TASK_TABLE_UNAVAILABLE');
  });
  it('does not clear unknown writes; explicit forget compares full intent and rejects during I/O', async () => {
    const f = pages(); f.execute.mockRejectedValueOnce(new Error('unknown'));
    await expect(f.client.submit(id, start)).rejects.toThrow();
    const expected = await f.client.inspect(id);
    await f.client.table(id); expect(await f.client.inspect(id)).toEqual(expected);
    await expect(f.client.forgetPending(id, { ...expected, pending: { ...expected.pending, taskId: 9 } as TaskRequest })).rejects.toThrow('TASK_JOURNAL_CHANGED');
    f.execute.mockImplementationOnce(async (_, r) => {
      await expect(f.client.forgetPending(id, expected)).rejects.toThrow('TASK_BUSY'); return response(r);
    });
    await f.client.read(id); const calls = f.execute.mock.calls.length;
    await f.client.forgetPending(id, expected); expect(await f.client.pending(id)).toBeUndefined(); expect(f.execute).toHaveBeenCalledTimes(calls);
  });
});

describe('fresh catalog anchored task snapshot', () => {
  function snapshotFixture(count = 1, total = 2) {
    const f = setup(), state = { revision: count ? 3 : 0, count, total, progress: 1 };
    const answer = (request: TaskRequest): TaskResponse => {
      const r = response(request);
      if (request.operation === 'catalog') {
        const head = { tableRevision: state.revision, count: state.count, capacity: 4,
          total: state.total, fingerprint: catalogHash };
        r.result = request.index === null ? { kind: 'catalog', ...head }
          : { kind: 'target', ...head, index: request.index,
              key: request.index === 0 ? 'power' : 'level', valueType: request.index === 0 ? 'boolean' : 'uint' };
      } else if (request.operation === 'read') {
        if (request.index === null) throw new Error('redundant task metadata read');
        r.result = { kind: 'record', tableRevision: state.revision, count: state.count, index: request.index,
          record: { taskId: 7 + request.index, definitionRevision: 2, consumedUtcMillis: 0,
            startSequence: 1, progress: state.progress,
            definition: { enabled: true, key: 'power', valueType: 'boolean', value: false,
              schedule: { kind: 'countdown', durationMillis: 3000 } } } };
      }
      return r;
    };
    f.execute.mockImplementation(async (_, request) => answer(request));
    return { ...f, state, answer };
  }
  it('reads a cold directory and every current row without a second metadata exchange', async () => {
    const f = snapshotFixture(), snapshot = await f.client.snapshot(id);
    expect(snapshot.catalog).toMatchObject({ capacity: 4, fingerprint: catalogHash });
    expect(snapshot.catalog.targets.map(t => t.key)).toEqual(['power', 'level']);
    expect(snapshot.table.revision).toBe(3); expect(snapshot.table.records.map(r => r.taskId)).toEqual([7]);
    expect(f.execute.mock.calls.map(([, r]) => [r.operation, 'index' in r ? r.index : null]))
      .toEqual([['catalog', null], ['catalog', 0], ['catalog', 1], ['read', 0]]);
    expect(f.execute.mock.calls.at(-1)![1]).toMatchObject({ expectedRevision: 3, index: 0 });
    expect(new Set(f.execute.mock.calls.map(([, r]) => r.requestId)).size).toBe(4);
  });
  it('reuses only warm targets while each snapshot anchors its rows to new authenticated metadata', async () => {
    const f = snapshotFixture(), catalog = await f.client.catalog(id); f.execute.mockClear();
    const first = await f.client.snapshot(id);
    expect(first.catalog).toBe(catalog); expect(first.table.revision).toBe(3);
    expect(f.execute.mock.calls.map(([, r]) => r.operation)).toEqual(['catalog', 'read']);
    f.state.revision = 4; f.state.count = 2; f.execute.mockClear();
    const next = await f.client.snapshot(id);
    expect(next.catalog).toBe(catalog); expect(next.table.revision).toBe(4);
    expect(next.table.records.map(r => r.taskId)).toEqual([7, 8]);
    expect(f.execute.mock.calls.map(([, r]) => r.operation)).toEqual(['catalog', 'read', 'read']);
    expect(f.execute.mock.calls.slice(1).every(([, r]) => 'expectedRevision' in r && r.expectedRevision === 4)).toBe(true);
    expect(catalog).not.toHaveProperty('tableRevision'); expect(catalog).not.toHaveProperty('count');
  });
  it('requires a new catalog exchange for every empty snapshot and never reuses an old empty header', async () => {
    const f = snapshotFixture(0, 0);
    for (const revision of [0, 4]) {
      f.state.revision = revision; f.execute.mockClear();
      expect((await f.client.snapshot(id)).table).toEqual({ revision, records: [] });
      expect(f.execute.mock.calls).toHaveLength(1);
      expect(f.execute.mock.calls[0][1]).toMatchObject({ operation: 'catalog', fingerprint: null, index: null });
    }
  });
  it('uses the last authenticated target page header when the table changes during a cold directory read', async () => {
    const f = snapshotFixture(0);
    f.execute.mockImplementation(async (_, request) => {
      if (request.operation === 'catalog' && request.index === 0) { f.state.revision = 3; f.state.count = 1; }
      if (request.operation === 'catalog' && request.index === 1) { f.state.revision = 4; f.state.count = 2; }
      return f.answer(request);
    });
    const snapshot = await f.client.snapshot(id);
    expect(snapshot.table.revision).toBe(4); expect(snapshot.table.records.map(r => r.taskId)).toEqual([7, 8]);
    const reads = f.execute.mock.calls.map(([, r]) => r).filter(r => r.operation === 'read');
    expect(reads).toHaveLength(2);
    expect(reads.every(r => r.operation === 'read' && r.expectedRevision === 4 && r.index !== null)).toBe(true);
  });
  it('reads changed progress again even when table revision and cached targets are unchanged', async () => {
    const f = snapshotFixture(), first = await f.client.snapshot(id); f.execute.mockClear(); f.state.progress = 3;
    const next = await f.client.snapshot(id);
    expect(next.table.revision).toBe(first.table.revision); expect(next.catalog).toBe(first.catalog);
    expect(first.table.records[0].progress).toBe(1); expect(next.table.records[0].progress).toBe(3);
    expect(next.table.records[0]).not.toBe(first.table.records[0]);
    expect(f.execute.mock.calls.map(([, r]) => [r.operation, 'index' in r ? r.index : null]))
      .toEqual([['catalog', null], ['read', 0]]);
  });
  it('rejects changed row revisions, counts or duplicate task IDs rather than publishing a mixed table', async () => {
    for (const mismatch of ['revision', 'count', 'duplicate']) {
      const f = snapshotFixture(mismatch === 'duplicate' ? 2 : 1);
      f.execute.mockImplementation(async (_, request) => {
        const r = f.answer(request);
        if (r.result?.kind === 'record') {
          if (mismatch === 'revision') r.result.tableRevision++;
          if (mismatch === 'count') r.result.count++;
          if (mismatch === 'duplicate') r.result.record.taskId = 7;
        }
        return r;
      });
      await expect(f.client.snapshot(id)).rejects.toThrow();
      expect(f.execute.mock.calls.filter(([, r]) => r.operation === 'read')
        .every(([, r]) => r.operation === 'read' && r.expectedRevision === 3 && r.index !== null)).toBe(true);
    }
  });
  it('rejects historical, invalid or failed metadata without falling back to a prior table or warm directory', async () => {
    for (const invalid of ['historical', 'capacity', 'offline']) {
      const f = snapshotFixture(); await f.client.snapshot(id); f.execute.mockClear();
      f.execute.mockImplementationOnce(async (_, request) => {
        if (invalid === 'offline') throw new Error('TASK_DEVICE_OFFLINE');
        if (invalid === 'historical') return response(request, true);
        const r = f.answer(request);
        if (r.result?.kind === 'catalog') r.result.count = 5;
        return r;
      });
      await expect(f.client.snapshot(id)).rejects.toThrow();
      expect(f.execute.mock.calls).toHaveLength(1);
      f.execute.mockClear(); await f.client.snapshot(id);
      expect(f.execute.mock.calls).toHaveLength(4);
    }
  });
  it('rejects cancellation after an empty catalog has settled but before its snapshot can return', async () => {
    const f = snapshotFixture(0, 0), aborter = new AbortController();
    const internals = f.client as unknown as { readCatalog: (...args: unknown[]) => Promise<unknown> };
    const readCatalog = internals.readCatalog.bind(f.client), spy = vi.spyOn(internals, 'readCatalog');
    spy.mockImplementationOnce(async (...args) => {
      const snapshot = await readCatalog(...args); queueMicrotask(() => aborter.abort()); return snapshot;
    });
    try {
      await expect(f.client.snapshot(id, aborter.signal)).rejects.toThrow();
      expect(f.execute.mock.calls).toHaveLength(1); expect(f.data.size).toBe(0);
    } finally { spy.mockRestore(); }
  });
  it('rejects account, epoch and authority changes after an empty catalog settles', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(API, 'BASE_URL')!;
    try {
      for (const transition of ['account', 'epoch', 'authority']) {
        const f = snapshotFixture(0, 0);
        const internals = f.client as unknown as { readCatalog: (...args: unknown[]) => Promise<unknown> };
        const readCatalog = internals.readCatalog.bind(f.client), spy = vi.spyOn(internals, 'readCatalog');
        spy.mockImplementationOnce(async (...args) => {
          const snapshot = await readCatalog(...args);
          queueMicrotask(() => {
            if (transition === 'account') f.account.accountId = 'other';
            else if (transition === 'epoch') f.account.sessionEpoch++;
            else {
              Object.defineProperty(API, 'BASE_URL', { ...descriptor, value: 'https://another.example' });
              f.account.authority = API.BASE_URL;
            }
          });
          return snapshot;
        });
        try {
          await expect(f.client.snapshot(id)).rejects.toThrow('TASK_ACCOUNT_CHANGED');
          expect(f.execute.mock.calls).toHaveLength(1); expect(f.data.size).toBe(0);
        } finally { spy.mockRestore(); Object.defineProperty(API, 'BASE_URL', descriptor); }
      }
    } finally { Object.defineProperty(API, 'BASE_URL', descriptor); }
  });
  it('keeps an unknown Start byte-for-byte across fresh snapshots without replay or journal writes', async () => {
    const f = snapshotFixture(); f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.submit(id, start)).rejects.toThrow('TASK_OUTCOME_UNKNOWN');
    const pending = await f.client.pending(id), original = [...f.data]; f.execute.mockClear();
    await f.client.snapshot(id); f.state.progress = 3;
    expect((await f.client.snapshot(id)).table.records[0].progress).toBe(3);
    expect([...f.data]).toEqual(original); expect(await f.client.pending(id)).toEqual(pending);
    expect(f.execute.mock.calls.every(([, r]) => r.operation === 'catalog' || r.operation === 'read')).toBe(true);
    expect(f.execute.mock.calls).toHaveLength(6);
  });
});

describe('bounded authority recovery beside an unknown write', () => {
  async function unknown(intent: typeof start | { operation: 'initialize' } = start) {
    const f = setup(); f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.submit(id, intent)).rejects.toThrow();
    return { ...f, original: await f.client.inspect(id) };
  }
  it('keeps the old intent, confirms only the sync and durably blocks old retries after restart', async () => {
    for (const intent of [start, { operation: 'initialize' as const }]) {
      const f = await unknown(intent);
      const sync = await f.client.synchronizeAuthority(id, f.original);
      expect(sync.result?.kind).toBe('authority'); expect(sync.requestId).not.toBe(f.original.pending!.requestId);
      const restored = f.create(), held = await restored.inspect(id);
      expect(held).toEqual({ pending: f.original.pending, authority: undefined, held: true });
      await expect(restored.retry(id)).rejects.toThrow('TASK_INTENT_HELD');
      await expect(restored.submit(id, start)).rejects.toThrow('TASK_PENDING_INTENT');
      await restored.read(id); expect(await restored.inspect(id)).toEqual(held);
      await expect(restored.forgetPending(id, f.original)).rejects.toThrow('TASK_JOURNAL_CHANGED');
      const calls = f.execute.mock.calls.length;
      await restored.forgetPending(id, held); expect(await restored.pending(id)).toBeUndefined();
      expect(f.execute).toHaveBeenCalledTimes(calls); expect(f.data.size).toBe(0);
    }
  });
  it('resumes only the exact sync ID after a lost response; queries clear neither intent', async () => {
    const f = await unknown(); f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.synchronizeAuthority(id, f.original)).rejects.toThrow();
    const held = await f.client.inspect(id), restored = f.create();
    expect(held.held).toBe(true); expect(held.authority?.operation).toBe('initialize');
    expect(held.pending).toEqual(f.original.pending); expect(f.data.size).toBe(1);
    await restored.read(id); expect(await restored.inspect(id)).toEqual(held);
    await expect(restored.synchronizeAuthority(id, f.original)).rejects.toThrow('TASK_JOURNAL_CHANGED');
    f.execute.mockImplementationOnce(async (_, r) => response(r, true));
    await restored.synchronizeAuthority(id, held);
    expect(f.execute.mock.calls.at(-1)![1]).toEqual(held.authority);
    expect(await restored.inspect(id)).toEqual({ ...held, authority: undefined });
  });
  it('writes both intents in one durable barrier, blocks concurrency and sends nothing after cancellation', async () => {
    const f = await unknown(), aborter = new AbortController();
    let commit!: () => void;
    const save = f.storage.setItem;
    f.storage.setItem = (key, value) => new Promise<void>(resolve => { commit = () => { save(key, value); resolve(); }; });
    const work = f.client.synchronizeAuthority(id, f.original, aborter.signal);
    await vi.waitFor(() => expect(commit).toBeTypeOf('function'));
    await expect(f.client.retry(id)).rejects.toThrow('TASK_BUSY');
    await expect(f.client.synchronizeAuthority(id, f.original)).rejects.toThrow('TASK_BUSY');
    expect(f.execute).toHaveBeenCalledTimes(1); aborter.abort(); commit();
    await expect(work).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(1);
    expect((await f.create().inspect(id)).authority?.operation).toBe('initialize');
  });
  it('does not send on failed sync commit or clear the old intent on failed settlement commit', async () => {
    const f = await unknown(), save = f.storage.setItem;
    f.storage.setItem = () => { throw Error('quota'); };
    await expect(f.client.synchronizeAuthority(id, f.original)).rejects.toThrow('quota');
    expect(await f.client.inspect(id)).toEqual(f.original); expect(f.execute).toHaveBeenCalledTimes(1);
    let writes = 0;
    f.storage.setItem = (key, value) => { if (++writes === 2) throw Error('quota'); save(key, value); };
    await expect(f.client.synchronizeAuthority(id, f.original)).rejects.toThrow('quota');
    const held = await f.client.inspect(id);
    expect(held.pending).toEqual(f.original.pending); expect(held.authority).toBeDefined();
    await expect(f.client.retry(id)).rejects.toThrow('TASK_INTENT_HELD');
  });
  it('preserves recovery for the old account/epoch and rejects corrupted recovery records before network', async () => {
    const f = await unknown(); f.execute.mockImplementationOnce(async (_, r) => { f.account.sessionEpoch++; return response(r); });
    await expect(f.client.synchronizeAuthority(id, f.original)).rejects.toThrow('TASK_ACCOUNT_CHANGED');
    const held = await f.client.inspect(id);
    f.account.accountId = 'other'; expect(await f.client.inspect(id)).toEqual({ held: false });
    f.account.accountId = 'owner'; expect(await f.create().inspect(id)).toEqual(held);
    const key = [...f.data.keys()][0], valid = JSON.parse(f.data.get(key)!);
    for (const patch of [{ format: 'task-recovery/2' }, { extra: true }, { pending: held.authority },
      { authority: held.pending }, { authority: { ...held.authority, requestId: held.pending!.requestId } }]) {
      f.data.set(key, JSON.stringify({ ...valid, ...patch }));
      await expect(f.client.retry(id)).rejects.toThrow();
      await expect(f.client.synchronizeAuthority(id, held)).rejects.toThrow();
    }
    expect(f.execute).toHaveBeenCalledTimes(2);
  });
  it('a second Key change cannot replace a still-unconfirmed sync; explicit review may release both', async () => {
    const f = await unknown(); f.execute.mockRejectedValueOnce(new Error('TASK_OUTCOME_UNKNOWN'));
    await expect(f.client.synchronizeAuthority(id, f.original)).rejects.toThrow();
    const held = await f.client.inspect(id);
    f.execute.mockRejectedValueOnce(new Error('TASK_REQUEST_CONFLICT'));
    await expect(f.client.synchronizeAuthority(id, held)).rejects.toThrow('TASK_REQUEST_CONFLICT');
    expect(f.execute.mock.calls.at(-1)![1]).toEqual(held.authority);
    expect(await f.client.inspect(id)).toEqual(held);
    await f.client.forgetPending(id, held); expect(f.data.size).toBe(0);
  });
});
