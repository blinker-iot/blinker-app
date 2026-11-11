import { DeviceV2AccountContext, deviceV2AccountStoragePrefix, validateDeviceV2AccountScope } from '../account-scope';
import { IntentStorage } from '../intent-storage';
import { AutomationDetail, AutomationIntent, AutomationPage, automationAssert, automationErrorCode,
  automationId, automationInitialWriteRejected, automationIntent, automationWriteOutcome } from './contract';

export interface AutomationApi {
  list(retired: boolean, after: string | undefined, signal: AbortSignal): Promise<AutomationPage>;
  get(id: string, signal: AbortSignal): Promise<AutomationDetail>;
  write(intent: AutomationIntent, signal: AbortSignal): Promise<AutomationDetail>;
}
// One small journal per authority/account, at most 16 independent rule intents.
// Only ONE unresolved create; other existing rules can still be stopped/retired
// to free quota. No background retry, worker, device session or credential store.
export class AutomationClient {
  private readonly active = new Set<string>();
  constructor(private readonly api: AutomationApi, private readonly storage: IntentStorage,
    private readonly context: () => DeviceV2AccountContext) {}
  private capture(): DeviceV2AccountContext {
    const c = this.context(); validateDeviceV2AccountScope(c);
    automationAssert(Number.isSafeInteger(c.sessionEpoch) && c.sessionEpoch >= 0, 'AUTOMATION_ACCOUNT_CHANGED'); return { ...c };
  }
  private check(c: DeviceV2AccountContext, signal?: AbortSignal): void {
    signal?.throwIfAborted(); const current = this.capture();
    automationAssert(current.authority === c.authority && current.accountId === c.accountId && current.sessionEpoch === c.sessionEpoch, 'AUTOMATION_ACCOUNT_CHANGED');
  }
  private key(c: DeviceV2AccountContext): string { return deviceV2AccountStoragePrefix('automation-v1:', c) + 'pending'; }
  private async load(key: string): Promise<AutomationIntent[]> {
    const raw = await this.storage.getItem(key);
    if (raw === null) return [];
    try {
      automationAssert(raw.length <= 32768); const values = JSON.parse(raw);
      automationAssert(Array.isArray(values) && values.length <= 16);
      const intents = values.map(automationIntent);
      automationAssert(new Set(intents.map(i => i.ruleId)).size === intents.length); return intents;
    } catch { throw new Error('AUTOMATION_JOURNAL_INVALID'); }
  }
  private async save(key: string, values: AutomationIntent[]): Promise<void> {
    if (values.length) await this.storage.setItem(key, JSON.stringify(values)); else await this.storage.removeItem(key);
  }
  private async exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    automationAssert(!this.active.has(key), 'AUTOMATION_BUSY'); this.active.add(key);
    try { return await work(); } finally { this.active.delete(key); }
  }
  async pending(): Promise<AutomationIntent[]> {
    const c = this.capture(), values = await this.load(this.key(c)); this.check(c); return values;
  }
  async list(retired: boolean, after: string | undefined, signal: AbortSignal): Promise<AutomationPage> {
    const c = this.capture(); this.check(c, signal); const result = await this.api.list(retired, after, signal); this.check(c, signal); return result;
  }
  async get(id: string, signal: AbortSignal): Promise<AutomationDetail> {
    automationId(id); const c = this.capture(); this.check(c, signal);
    const result = await this.api.get(id, signal); this.check(c, signal); return result;
  }
  async submit(input: AutomationIntent, signal: AbortSignal): Promise<AutomationDetail> {
    const intent = automationIntent(input), c = this.capture(), key = this.key(c); this.check(c, signal);
    return this.exclusive(key, async () => {
      const pending = await this.load(key); this.check(c, signal);
      automationAssert(pending.length < 16 && !pending.some(p => p.ruleId === intent.ruleId), 'AUTOMATION_PENDING_INTENT');
      if (intent.operation === 'put' && intent.body.expectedRevision === 0)
        automationAssert(!pending.some(p => p.operation === 'put' && p.body.expectedRevision === 0), 'AUTOMATION_PENDING_CREATE');
      await this.save(key, [...pending, intent]); this.check(c, signal);
      // The durable commit precedes the first HTTP. Cancellation leaves origin-account history.
      let result: AutomationDetail;
      try { result = await this.api.write(intent, signal); }
      catch (error) {
        this.check(c, signal);
        if (automationInitialWriteRejected(error)) { await this.save(key, pending); this.check(c, signal); }
        throw error;
      }
      this.check(c, signal);
      automationAssert(automationWriteOutcome(intent, result.rule) === 'confirmed', 'AUTOMATION_WRITE_NOT_CONFIRMED');
      await this.save(key, pending); this.check(c, signal); return result;
    });
  }
  // GET always precedes a user-requested exact retry. Changed state remains for
  // explicit review; read-only refresh never dispatches a PUT/POST.
  async recover(ruleId: string, retry: boolean, signal: AbortSignal): Promise<{ detail?: AutomationDetail; outcome: 'confirmed' | 'changed' | 'unresolved' }> {
    automationId(ruleId); const c = this.capture(), key = this.key(c); this.check(c, signal);
    return this.exclusive(key, async () => {
      const pending = await this.load(key); this.check(c, signal);
      const intent = pending.find(p => p.ruleId === ruleId); automationAssert(intent, 'AUTOMATION_NO_PENDING');
      let detail: AutomationDetail | undefined;
      try { detail = await this.api.get(ruleId, signal); }
      catch (error) {
        if (automationErrorCode(error) !== 'AUTOMATION_NOT_FOUND' || intent.operation !== 'put' || intent.body.expectedRevision !== 0) throw error;
      }
      this.check(c, signal);
      let outcome = detail ? automationWriteOutcome(intent, detail.rule) : 'unresolved' as const;
      if (retry && outcome === 'unresolved') {
        detail = await this.api.write(intent, signal); this.check(c, signal); outcome = automationWriteOutcome(intent, detail.rule);
      }
      if (outcome === 'confirmed') { await this.save(key, pending.filter(p => p.ruleId !== ruleId)); this.check(c, signal); }
      return { detail, outcome };
    });
  }
  async acceptChanged(expected: AutomationIntent, signal: AbortSignal): Promise<AutomationDetail> {
    const intent = automationIntent(expected), c = this.capture(), key = this.key(c); this.check(c, signal);
    return this.exclusive(key, async () => {
      const pending = await this.load(key); this.check(c, signal);
      automationAssert(JSON.stringify(pending.find(p => p.ruleId === intent.ruleId)) === JSON.stringify(intent), 'AUTOMATION_PENDING_CHANGED');
      const detail = await this.api.get(intent.ruleId, signal); this.check(c, signal);
      automationAssert(automationWriteOutcome(intent, detail.rule) !== 'unresolved', 'AUTOMATION_OUTCOME_UNKNOWN');
      // Revision already advanced; the old CAS can no longer change this rule.
      // This discards LOCAL tracking only, never retires a cloud rule/execution.
      await this.save(key, pending.filter(p => p.ruleId !== intent.ruleId)); this.check(c, signal); return detail;
    });
  }
}
