import '@angular/compiler';
import { Subject } from 'rxjs';
import { AutomationDetail, AutomationIntent, AutomationRule } from '../../../core/device-v2/automation/contract';
import { AutomationPage } from './automation.page';
import { AutomationService } from './automation.service';

const manifest = { revision: 1, fingerprint: 'ab'.repeat(32), fields: [
  { id: 1, key: 'power', kind: 0, type: 0, access: 7 },
] };
const endpoint = { deviceId: 'source', key: 'power', fingerprint: manifest.fingerprint, valueType: 'boolean' as const };
const condition = { kind: 'boolean-edge' as const, direction: 'rising' as const };
const rule: AutomationRule = { ruleId: 'rule', name: '原名称', definitionRevision: 7, source: endpoint,
  target: { ...endpoint, deviceId: 'target', value: true }, enabled: false, condition, policyVersion: 2,
  status: 'disabled', targetOutcomeUnknown: false, retiredAtMs: null, updatedAtMs: 1 };
const originalDetail: AutomationDetail = { rule, recentExecutions: [] };
const confirmedDetail: AutomationDetail = { ...originalDetail, rule: { ...rule, name: '已确认名称', definitionRevision: 8 } };
const unknown: AutomationIntent = { ruleId: 'unrelated-unknown', operation: 'retire', body: { expectedRevision: 3 } };
const listPage = { rules: [confirmedDetail.rule], nextAfter: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
// Drain only already-queued work. These tests must fail on a refresh-blocked
// confirmation, rather than hang until a never-resolved fake HTTP finishes.
async function drain(): Promise<void> { for (let i = 0; i < 24; ++i) await Promise.resolve(); }
function setup() {
  const data = { auth: { uuid: 'owner' }, sessionEpoch: 1, authDataChanged: new Subject<void>(), device: { dict: {
    source: { deviceType: 'diy', config: { mode: 'bbp2', customName: 'Source' } },
    target: { deviceType: 'diy', config: { mode: 'bbp2', customName: 'Target' } },
  } } };
  const client = {
    list: vi.fn(async (_retired: boolean, _after: string | undefined, _signal: AbortSignal) => ({ rules: [rule], nextAfter: null })),
    pending: vi.fn(async () => [] as AutomationIntent[]),
    get: vi.fn(async (_ruleId: string, _signal: AbortSignal) => originalDetail),
    submit: vi.fn(async (_intent: AutomationIntent, _signal: AbortSignal) => confirmedDetail),
    recover: vi.fn(async () => ({ detail: originalDetail, outcome: 'unresolved' as const })),
    acceptChanged: vi.fn(async () => originalDetail),
  };
  const service = new AutomationService(client as any, data as any, { load: () => manifest } as any);
  const alerts = { create: vi.fn(async () => ({ present: async () => undefined,
    onDidDismiss: async () => ({ role: 'confirm' }) })) };
  const page = new AutomationPage(service, alerts as any, { markForCheck: vi.fn() } as any);
  return { data, client, service, page };
}

describe('automation confirmed writes and independent fresh reads', () => {
  it('returns from a confirmed save and enters detail while list and pending reads still hold the write lock', async () => {
    const f = setup(); await f.service.open();
    const list = deferred<typeof listPage>(), pending = deferred<AutomationIntent[]>();
    f.client.list.mockImplementationOnce(() => list.promise);
    f.client.pending.mockImplementationOnce(() => pending.promise);
    f.page.startCreate(); f.page.name = '新自动化'; f.page.source = 'source:1'; f.page.target = 'target:1';
    let returned = false; const save = f.page.save().then(() => { returned = true; });
    await drain();
    expect(returned).toBe(true); expect(f.page.view).toBe('detail');
    expect(f.service.state()).toMatchObject({ detail: confirmedDetail, notice: '配置已保存。',
      ready: false, busy: true, refreshing: true, refreshError: '', error: '' });
    expect(f.client.submit).toHaveBeenCalledTimes(1); expect(f.page.canStartCreate).toBe(false);
    list.resolve(listPage); await drain();
    expect(f.client.pending).toHaveBeenCalledTimes(2);
    expect(f.service.state().busy).toBe(true);
    pending.resolve([unknown]); await drain(); await save;
    expect(f.service.state()).toMatchObject({ ready: true, busy: false, refreshing: false,
      detail: confirmedDetail, pending: [unknown], notice: '配置已保存。', refreshError: '' });
    f.service.ngOnDestroy();
  });

  it.each(['list', 'pending'] as const)('keeps confirmation after %s failure; header retry performs only fresh reads', async failingRead => {
    const f = setup(); await f.service.open();
    f.service.state.update(s => ({ ...s, pending: [unknown] }));
    f.client.pending.mockResolvedValue([unknown]);
    const privateError = new Error('untrusted-server-error-marker');
    if (failingRead === 'list') f.client.list.mockRejectedValueOnce(privateError);
    else f.client.pending.mockRejectedValueOnce(privateError);
    expect(await f.service.edit(rule, '已确认名称', condition, true)).toBe(true); await drain();
    const failed = f.service.state();
    expect(failed).toMatchObject({ ready: false, busy: false, refreshing: false,
      detail: confirmedDetail, notice: '配置已保存。', error: '', pending: [unknown] });
    expect(failed.refreshError).not.toBe(''); expect(failed.refreshError).not.toContain(privateError.message);
    const reads = { list: f.client.list.mock.calls.length, pending: f.client.pending.mock.calls.length };
    const retryList = deferred<typeof listPage>(); f.client.list.mockImplementationOnce(() => retryList.promise);
    f.page.view = 'detail'; const retry = f.page.refresh(); await drain();
    expect(f.page.view).toBe('detail'); expect(f.service.state().detail).toBe(confirmedDetail);
    expect(f.service.state().notice).toBe('配置已保存。'); expect(f.service.state().busy).toBe(true);
    retryList.resolve(listPage); await retry; await drain();
    expect(f.service.state()).toMatchObject({ ready: true, busy: false, refreshing: false,
      detail: confirmedDetail, pending: [unknown], notice: '配置已保存。', refreshError: '' });
    expect(f.client.list).toHaveBeenCalledTimes(reads.list + 1);
    expect(f.client.pending).toHaveBeenCalledTimes(reads.pending + 1);
    expect(f.client.get).not.toHaveBeenCalled(); expect(f.client.submit).toHaveBeenCalledTimes(1);
    expect(f.client.recover).not.toHaveBeenCalled(); expect(f.client.acceptChanged).not.toHaveBeenCalled();
    f.service.ngOnDestroy();
  });

  it('does not turn a failed refresh retry into a failed write or drop an unrelated UNKNOWN', async () => {
    const f = setup(); await f.service.open();
    f.service.state.update(s => ({ ...s, pending: [unknown] }));
    f.client.pending.mockResolvedValue([unknown]);
    f.client.list.mockRejectedValue(new Error('read unavailable'));
    expect(await f.service.edit(rule, '已确认名称', condition, true)).toBe(true); await drain();
    const first = f.service.state().refreshError;
    await f.service.retryRefresh(); await drain();
    expect(f.service.state()).toMatchObject({ detail: confirmedDetail, notice: '配置已保存。',
      ready: false, busy: false, refreshing: false, refreshError: first, error: '', pending: [unknown] });
    expect(f.client.submit).toHaveBeenCalledTimes(1); expect(f.client.recover).not.toHaveBeenCalled();
    f.service.ngOnDestroy();
  });

  it('clears an old list refresh error only after another pending request reads a fresh list and journal', async () => {
    const f = setup(); f.client.pending.mockResolvedValue([unknown]); await f.service.open();
    f.client.list.mockRejectedValueOnce(new Error('read unavailable'));
    expect(await f.service.edit(rule, '已确认名称', condition, true)).toBe(true); await drain();
    expect(f.service.state().refreshError).not.toBe(''); expect(f.service.state().ready).toBe(false);
    await f.service.inspect(rule.ruleId);
    expect(f.service.state().refreshError).not.toBe(''); expect(f.service.state().ready).toBe(false);
    f.client.list.mockResolvedValue(listPage); await f.service.recover(unknown);
    expect(f.service.state()).toMatchObject({ ready: true, busy: false, refreshError: '', pending: [unknown] });
    expect(f.client.recover).toHaveBeenCalledWith(unknown.ruleId, false, expect.any(AbortSignal));
    expect(f.client.submit).toHaveBeenCalledTimes(1); f.service.ngOnDestroy();
  });

  it('denies new writes while a confirmed snapshot is refreshing or unavailable, then preserves the fresh CAS', async () => {
    const f = setup(); await f.service.open();
    const read = deferred<typeof listPage>(); f.client.list.mockImplementationOnce(() => read.promise);
    expect(await f.service.edit(rule, '已确认名称', condition, true)).toBe(true); await drain();
    for (const stage of ['refreshing', 'unavailable']) {
      expect(f.page.canStartCreate).toBe(false);
      await f.service.create('source:1', 'target:1', true, condition, '不可发送');
      await f.service.edit(confirmedDetail.rule, '不可发送', condition, true);
      await f.service.toggle(confirmedDetail.rule); await f.service.retire(confirmedDetail.rule);
      await f.page.startEdit(confirmedDetail.rule); expect(f.client.get).not.toHaveBeenCalled();
      expect(f.client.submit).toHaveBeenCalledTimes(1);
      if (stage === 'refreshing') { read.reject(new Error('read unavailable')); await drain(); }
    }
    f.client.list.mockResolvedValue(listPage); await f.service.retryRefresh();
    await f.service.toggle(f.service.state().rules[0]); await drain();
    expect(f.client.submit).toHaveBeenCalledTimes(2);
    expect(f.client.submit.mock.calls[1][0]).toMatchObject({ ruleId: rule.ruleId, operation: 'put',
      body: { expectedRevision: 8, enabled: true } });
    expect(rule.definitionRevision).toBe(7); expect(rule.enabled).toBe(false);
    f.service.ngOnDestroy();
  });

  it.each(['close', 'account', 'epoch'] as const)('ignores post-confirm list completion after %s cancellation', async change => {
    const f = setup(); await f.service.open();
    const read = deferred<typeof listPage>(); f.client.list.mockImplementationOnce(() => read.promise);
    expect(await f.service.edit(rule, '已确认名称', condition, true)).toBe(true); await drain();
    const signal = f.client.list.mock.calls.at(-1)![2];
    if (change === 'close') f.service.close();
    else {
      if (change === 'account') f.data.auth.uuid = 'next-owner';
      ++f.data.sessionEpoch; f.data.authDataChanged.next();
    }
    expect(signal.aborted).toBe(true); const afterClose = f.service.state();
    read.resolve(listPage); await drain();
    expect(f.service.state()).toEqual(afterClose);
    expect(f.service.state()).toMatchObject({ ready: false, busy: false, refreshing: false,
      rules: [], pending: [], detail: undefined, notice: '', refreshError: '' });
    expect(f.client.submit).toHaveBeenCalledTimes(1); expect(f.client.recover).not.toHaveBeenCalled();
    f.service.ngOnDestroy();
  });

  it('does not copy an old pending read or unlock a newly opened account', async () => {
    const f = setup(); await f.service.open();
    const oldPending = deferred<AutomationIntent[]>(); f.client.pending.mockImplementationOnce(() => oldPending.promise);
    expect(await f.service.edit(rule, '已确认名称', condition, true)).toBe(true); await drain();
    expect(f.service.state().busy).toBe(true);
    f.data.auth.uuid = 'next-owner'; ++f.data.sessionEpoch; f.data.authDataChanged.next();
    const newList = deferred<typeof listPage>(); f.client.list.mockImplementationOnce(() => newList.promise);
    const reopening = f.service.open(); await drain(); const beforeLateReply = f.service.state();
    oldPending.resolve([unknown]); await drain();
    expect(f.service.state()).toEqual(beforeLateReply); expect(f.service.state().busy).toBe(true);
    newList.resolve({ rules: [], nextAfter: null }); await reopening;
    expect(f.service.state()).toMatchObject({ ready: true, busy: false, rules: [], pending: [], detail: undefined, notice: '' });
    f.service.ngOnDestroy();
  });

  it('does not report success when submit fails and leaves the original UNKNOWN query-only', async () => {
    const f = setup(); f.client.pending.mockResolvedValue([unknown]); await f.service.open();
    f.client.submit.mockRejectedValueOnce(new Error('AUTOMATION_WRITE_NOT_CONFIRMED'));
    expect(await f.service.edit(rule, '新名称', condition, true)).toBe(false);
    expect(f.service.state().error).not.toBe('');
    expect(f.service.state()).toMatchObject({ notice: '', detail: undefined, pending: [unknown],
      refreshing: false, refreshError: '', busy: false });
    expect(f.client.list).toHaveBeenCalledTimes(1); expect(f.client.submit).toHaveBeenCalledTimes(1);
    expect(f.client.recover).not.toHaveBeenCalled(); expect(f.client.acceptChanged).not.toHaveBeenCalled();
    f.service.ngOnDestroy();
  });

  it.each(['close', 'account', 'epoch'] as const)('never promotes a submit response arriving after %s cancellation', async change => {
    const f = setup(); await f.service.open();
    const response = deferred<AutomationDetail>(); f.client.submit.mockImplementationOnce(() => response.promise);
    const submitting = f.service.edit(rule, '新名称', condition, true); await drain();
    const signal = f.client.submit.mock.calls[0][1];
    if (change === 'close') f.service.close();
    else {
      if (change === 'account') f.data.auth.uuid = 'next-owner';
      ++f.data.sessionEpoch; f.data.authDataChanged.next();
    }
    expect(signal.aborted).toBe(true); const afterClose = f.service.state();
    response.resolve(confirmedDetail); expect(await submitting).toBe(false); await drain();
    expect(f.service.state()).toEqual(afterClose); expect(f.client.list).toHaveBeenCalledTimes(1);
    expect(f.client.submit).toHaveBeenCalledTimes(1); f.service.ngOnDestroy();
  });

  it.each(['create', 'edit', 'toggle', 'retire'] as const)('%s confirms one original write without replaying it after a read failure', async operation => {
    const f = setup(); await f.service.open(); f.client.list.mockRejectedValueOnce(new Error('read unavailable'));
    if (operation === 'create') expect(await f.service.create('source:1', 'target:1', true, condition, '新名称')).toBe(true);
    else if (operation === 'edit') expect(await f.service.edit(rule, '新名称', condition, false)).toBe(true);
    else if (operation === 'toggle') await f.service.toggle(rule);
    else await f.service.retire(rule);
    await drain();
    const intent = f.client.submit.mock.calls[0][0];
    expect(intent.operation).toBe(operation === 'retire' ? 'retire' : 'put');
    expect(intent.body.expectedRevision).toBe(operation === 'create' ? 0 : rule.definitionRevision);
    if (operation !== 'create') expect(intent.ruleId).toBe(rule.ruleId);
    if (operation === 'create') expect(intent).toMatchObject({ body: { enabled: false, name: '新名称' } });
    if (operation === 'edit') expect(intent).toMatchObject({ body: { enabled: false, name: '新名称', target: { value: false } } });
    if (operation === 'toggle') expect(intent).toMatchObject({ body: { enabled: true, name: rule.name } });
    if (operation === 'retire') expect(intent.body).toEqual({ expectedRevision: rule.definitionRevision });
    const originalIntent = structuredClone(intent);
    f.client.list.mockResolvedValue(listPage); await f.service.retryRefresh();
    expect(f.client.submit).toHaveBeenCalledTimes(1); expect(f.client.submit.mock.calls[0][0]).toEqual(originalIntent);
    expect(f.client.recover).not.toHaveBeenCalled(); expect(f.client.acceptChanged).not.toHaveBeenCalled();
    expect(f.service.state().notice).toBe('配置已保存。'); expect(f.service.state().detail).toBe(confirmedDetail);
    f.service.ngOnDestroy();
  });
});
