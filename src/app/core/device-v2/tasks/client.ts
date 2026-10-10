import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil, timeout, timer } from 'rxjs';
import { API } from '../../../configs/api.config';
import { DeviceV2AccountContext, deviceV2AccountStoragePrefix, validateDeviceV2AccountScope } from '../account-scope';
import { base64UrlEncode } from '../base64url';
import { IntentStorage } from '../intent-storage';
import { TaskCatalog, TaskIntent, TaskRecord, TaskRequest, TaskResponse, taskDeviceId, taskRequest, taskResponse } from './contract';

export interface TaskApi { execute(id: string, request: TaskRequest, signal: AbortSignal): Promise<TaskResponse>; }
export class HttpTaskApi implements TaskApi {
  private nextAt = 0;
  constructor(private readonly http: HttpClient) {}
  async execute(id: string, request: TaskRequest, signal: AbortSignal): Promise<TaskResponse> {
    signal.throwIfAborted(); taskDeviceId(id);
    const owned = taskRequest(request);
    // Each management request exchanges Prepare + Commit. Respect the existing
    // physical Broker's 4 exchanges/second; this is pacing, never a success guess.
    const delay = this.nextAt - performance.now();
    if (delay > 0) await firstValueFrom(timer(delay).pipe(takeUntil(fromEvent(signal, 'abort'))));
    signal.throwIfAborted();
    try {
      const response = await firstValueFrom(this.http.post<{ status: number; data: unknown }>(
        API.DEVICE_V2.TASKS(id), owned, { observe: 'response' },
      ).pipe(timeout(20000), takeUntil(fromEvent(signal, 'abort'))));
      signal.throwIfAborted();
      if (response.status !== 200 || response.body?.status !== 200
        || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')) throw new Error('TASK_RESPONSE_INVALID');
      return taskResponse(response.body.data, id, owned);
    } finally { this.nextAt = performance.now() + 550; }
  }
}

export interface TaskPendingState {
  pending?: TaskRequest;
  authority?: TaskRequest;
  held: boolean;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// One unresolved management intent plus at most one explicit authority recovery
// per account/device, atomically stored in the same record. This is not a retry
// queue: no background work, auto-Start, revision refresh or transport fallback.
// Storage contains typed intent only, never a DeviceKey, Grant or session token.
export class DeviceTaskClient {
  private readonly active = new Set<string>();
  constructor(private readonly api: TaskApi, private readonly storage: IntentStorage,
    private readonly context: () => DeviceV2AccountContext,
    private readonly random: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(16))) {}

  async pending(id: string): Promise<TaskRequest | undefined> {
    return (await this.inspect(id)).pending;
  }
  async inspect(id: string): Promise<TaskPendingState> {
    const account = this.capture(), key = this.key(account, id);
    const value = await this.load(key); this.assertAccount(account); return value;
  }
  // Only the explicit UI decision after a fresh table read calls this. It
  // releases the local intent, NOT the remote task/request or its execution.
  async forgetPending(id: string, expected: TaskPendingState): Promise<void> {
    const account = this.capture(), key = this.key(account, id);
    await this.exclusive(key, async () => {
      if (!expected.pending || !same(await this.load(key), expected)) throw new Error('TASK_JOURNAL_CHANGED');
      this.assertAccount(account); await this.storage.removeItem(key); this.assertAccount(account);
    });
  }
  async submit(id: string, intent: Exclude<TaskIntent, { operation: 'read' | 'catalog' }>, signal = new AbortController().signal): Promise<TaskResponse> {
    signal.throwIfAborted();
    const account = this.capture(), key = this.key(account, id);
    // Own the device slot BEFORE async storage. Never race two new intents.
    const request = taskRequest({ ...intent, contract: 'device-tasks/1', requestId: base64UrlEncode(this.random()) });
    return this.exclusive(key, async () => {
      if ((await this.load(key)).pending) throw new Error('TASK_PENDING_INTENT');
      signal.throwIfAborted(); this.assertAccount(account);
      // The storage port must resolve only after its durable commit, not a JS cache write.
      await this.storage.setItem(key, JSON.stringify(request));
      return this.send(account, key, id, request, signal, 'pending');
    });
  }
  async retry(id: string, signal = new AbortController().signal): Promise<TaskResponse> {
    signal.throwIfAborted();
    const account = this.capture(), key = this.key(account, id);
    return this.exclusive(key, async () => {
      const state = await this.load(key);
      if (!state.pending) throw new Error('TASK_NO_PENDING_INTENT');
      if (state.held) throw new Error('TASK_INTENT_HELD');
      return this.send(account, key, id, state.pending, signal, 'pending');
    });
  }
  // Called only after an explicit UI confirmation of authority recovery. Freeze
  // the old write BEFORE I/O; a new Key must never silently resubmit it. Failed
  // sync resumes its own exact ID, including after process/account recreation.
  async synchronizeAuthority(id: string, expected: TaskPendingState, signal = new AbortController().signal): Promise<TaskResponse> {
    signal.throwIfAborted();
    const account = this.capture(), key = this.key(account, id);
    return this.exclusive(key, async () => {
      const state = await this.load(key);
      if (!state.pending || !same(state, expected)) throw new Error('TASK_JOURNAL_CHANGED');
      if (!state.authority) {
        const authority = taskRequest({ contract: 'device-tasks/1', operation: 'initialize', requestId: base64UrlEncode(this.random()) });
        if (authority.requestId === state.pending.requestId) throw new Error('TASK_JOURNAL_CHANGED');
        state.authority = authority; state.held = true;
        signal.throwIfAborted(); this.assertAccount(account);
        await this.saveRecovery(key, state);
      }
      return this.send(account, key, id, state.authority, signal, 'authority');
    });
  }
  async read(id: string, expectedRevision = 0, index: number | null = null, signal = new AbortController().signal): Promise<TaskResponse> {
    // Fresh independent query does not clear or alter an unresolved write.
    return this.query(id, { operation: 'read', expectedRevision, index }, signal);
  }
  async catalog(id: string, signal = new AbortController().signal): Promise<TaskCatalog> {
    const account = this.capture();
    const metadata = await this.query(id, { operation: 'catalog', fingerprint: null, index: null }, signal);
    this.assertAccount(account);
    if (metadata.evidence !== 'fresh' || metadata.result?.kind !== 'catalog') throw new Error('TASK_CATALOG_UNAVAILABLE');
    const { capacity, total, fingerprint } = metadata.result;
    const targets: Array<TaskCatalog['targets'][number]> = [];
    for (let index = 0; index < total; ++index) {
      const response = await this.query(id, { operation: 'catalog', fingerprint, index }, signal);
      this.assertAccount(account);
      const page = response.result;
      if (response.evidence !== 'fresh' || page?.kind !== 'target' || page.total !== total || page.capacity !== capacity
        || targets.some(target => target.key === page.key)) throw new Error('TASK_CATALOG_INVALID');
      targets.push(Object.freeze({ key: page.key, valueType: page.valueType }));
    }
    return Object.freeze({ capacity, fingerprint, targets: Object.freeze(targets) });
  }
  async table(id: string, signal = new AbortController().signal): Promise<{ revision: number; records: TaskRecord[] }> {
    const account = this.capture(), response = await this.read(id, 0, null, signal);
    this.assertAccount(account);
    const metadata = response.result;
    if (response.evidence !== 'fresh' || metadata?.kind !== 'metadata') throw new Error('TASK_TABLE_UNAVAILABLE');
    const records: TaskRecord[] = [];
    for (let index = 0; index < metadata.count; ++index) {
      const response = await this.read(id, metadata.tableRevision, index, signal);
      this.assertAccount(account);
      const page = response.result;
      if (response.evidence !== 'fresh' || page?.kind !== 'record' || page.count !== metadata.count
        || records.some(record => record.taskId === page.record.taskId)) throw new Error('TASK_TABLE_CHANGED');
      records.push(page.record);
    }
    return { revision: metadata.tableRevision, records };
  }
  private query(id: string, intent: Extract<TaskIntent, { operation: 'read' | 'catalog' }>, signal: AbortSignal): Promise<TaskResponse> {
    signal.throwIfAborted();
    const account = this.capture(), key = this.key(account, id);
    const request = taskRequest({ contract: 'device-tasks/1', requestId: base64UrlEncode(this.random()), ...intent });
    return this.exclusive(key, () => this.send(account, key, id, request, signal));
  }
  private async exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (this.active.has(key)) throw new Error('TASK_BUSY');
    this.active.add(key);
    try { return await action(); } finally { this.active.delete(key); }
  }
  private async send(account: DeviceV2AccountContext, key: string, id: string, request: TaskRequest, signal: AbortSignal, lane?: 'pending' | 'authority'): Promise<TaskResponse> {
      const before = lane ? await this.load(key) : undefined;
      if (lane && (!same(before?.[lane], request) || (lane === 'pending' && before?.held))) throw new Error('TASK_JOURNAL_CHANGED');
      signal.throwIfAborted(); this.assertAccount(account);
      const response = taskResponse(await this.api.execute(id, request, signal), id, request);
      signal.throwIfAborted(); this.assertAccount(account);
      if (lane) {
        const retained = await this.load(key);
        if (!same(retained, before)) throw new Error('TASK_JOURNAL_CHANGED');
        signal.throwIfAborted(); this.assertAccount(account);
        if (lane === 'authority') await this.saveRecovery(key, { ...retained, authority: undefined });
        else await this.storage.removeItem(key);
        signal.throwIfAborted(); this.assertAccount(account);
      }
      return response;
  }
  private async saveRecovery(key: string, state: TaskPendingState): Promise<void> {
    await this.storage.setItem(key, JSON.stringify({ format: 'task-recovery/1', pending: state.pending, authority: state.authority ?? null }));
  }
  private async load(key: string): Promise<TaskPendingState> {
    const text = await this.storage.getItem(key);
    if (text === null) return { held: false };
    if (text.length > 2048) throw new Error('TASK_JOURNAL_CORRUPT');
    const value = JSON.parse(text);
    if (value?.format === 'task-recovery/1') {
      if (Object.keys(value).length !== 3 || !Object.hasOwn(value, 'pending') || !Object.hasOwn(value, 'authority')) throw new Error('TASK_JOURNAL_CORRUPT');
      const pending = this.writeRequest(value.pending);
      const authority = value.authority === null ? undefined : taskRequest(value.authority);
      if (authority && (authority.operation !== 'initialize' || authority.requestId === pending.requestId)) throw new Error('TASK_JOURNAL_CORRUPT');
      return { pending, authority, held: true };
    }
    // Existing single-intent journals remain readable; no startup rewrite.
    return { pending: this.writeRequest(value), held: false };
  }
  private writeRequest(value: unknown): TaskRequest {
    const request = taskRequest(value);
    if (request.operation === 'read' || request.operation === 'catalog') throw new Error('TASK_JOURNAL_CORRUPT');
    return request;
  }
  private capture(): DeviceV2AccountContext {
    const c = { ...this.context() }; validateDeviceV2AccountScope(c);
    if (c.authority !== API.BASE_URL || !Number.isSafeInteger(c.sessionEpoch) || c.sessionEpoch < 0) throw new Error('TASK_ACCOUNT_INVALID');
    return c;
  }
  private key(account: DeviceV2AccountContext, id: string): string {
    taskDeviceId(id); return deviceV2AccountStoragePrefix('blinker_task_intent_', account) + id;
  }
  private assertAccount(expected: DeviceV2AccountContext): void {
    const c = this.capture();
    if (c.accountId !== expected.accountId || c.authority !== expected.authority || c.sessionEpoch !== expected.sessionEpoch) throw new Error('TASK_ACCOUNT_CHANGED');
  }
}
