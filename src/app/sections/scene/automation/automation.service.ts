import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { DeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { AutomationClient } from '../../../core/device-v2/automation/client';
import { AutomationCondition, AutomationDetail, AutomationIntent, AutomationRule, automationIntent } from '../../../core/device-v2/automation/contract';
import { HttpAutomationApi } from '../../../core/device-v2/automation/http';
import { IndexedDbIntentStorage } from '../../../core/device-v2/intent-storage';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ManifestCache } from '../../../core/services/device-v2-manifest-cache.service';
import { capabilityBooleanLabel, capabilityDisplayName } from '../../../core/device-v2/display-metadata';
import { AutomationChoice, automationCapabilityGuidance, automationChoices, automationChoiceValue, automationDeviceName, automationErrorText } from './automation.models';
function context(data: DataService): DeviceV2AccountContext {
  if (!data.auth?.uuid) throw new Error('AUTOMATION_ACCOUNT_CHANGED');
  return { authority: API.BASE_URL, accountId: data.auth.uuid, sessionEpoch: data.sessionEpoch };
}
export const AUTOMATION_CLIENT = new InjectionToken<AutomationClient>('automation client', { providedIn: 'root', factory: () => {
  const data = inject(DataService);
  return new AutomationClient(new HttpAutomationApi(inject(HttpClient)),
    new IndexedDbIntentStorage('blinker-automations', 'AUTOMATION_JOURNAL_UNAVAILABLE'), () => context(data));
} });
@Injectable()
export class AutomationService implements OnDestroy {
  readonly state = signal({ ready: false, busy: false, refreshing: false, refreshError: '', error: '', notice: '', retired: false,
    rules: [] as AutomationRule[], pending: [] as AutomationIntent[], choices: [] as AutomationChoice[],
    nextAfter: null as string | null, detail: undefined as AutomationDetail | undefined,
    reviewed: undefined as AutomationIntent | undefined });
  private controller?: AbortController;
  private account?: DeviceV2AccountContext;
  private readonly subscription: Subscription;
  constructor(@Inject(AUTOMATION_CLIENT) private readonly client: AutomationClient,
    private readonly data: DataService, private readonly manifests: DeviceV2ManifestCache) {
    this.subscription = data.authDataChanged.subscribe(() => {
      if (this.account && (this.account.accountId !== data.auth?.uuid || this.account.sessionEpoch !== data.sessionEpoch)) {
        this.close(); this.patch({ error: automationErrorText(new Error('AUTOMATION_ACCOUNT_CHANGED')) });
      }
    });
  }
  private patch(value: Partial<ReturnType<typeof this.state>>): void { this.state.update(s => ({ ...s, ...value })); }
  async open(): Promise<void> {
    this.close();
    try { this.account = context(this.data); this.controller = new AbortController(); await this.refresh(false); }
    catch (error) { this.patch({ error: automationErrorText(error) }); }
  }
  close(): void {
    this.controller?.abort(); this.controller = undefined; this.account = undefined;
    this.patch({ ready: false, busy: false, refreshing: false, refreshError: '', rules: [], pending: [], choices: [], detail: undefined,
      reviewed: undefined, nextAfter: null, error: '', notice: '' });
  }
  ngOnDestroy(): void { this.close(); this.subscription.unsubscribe(); }
  private async run(work: (signal: AbortSignal) => Promise<void>, refreshConfirmed = false): Promise<void> {
    const c = this.controller; if (!c || this.state().busy) return;
    this.patch({ busy: true, error: '', notice: '' });
    let completed = false;
    try { await work(c.signal); completed = true; }
    catch (error) { if (this.current(c.signal)) this.patch({ error: automationErrorText(error) }); }
    finally {
      if (this.current(c.signal)) {
        if (completed && refreshConfirmed) {
          // The client has already verified the write and settled its durable
          // intent. Neither list I/O nor a redundant journal read holds up its
          // confirmation; this read retains the same page/account owner.
          void this.refreshConfirmedList(c.signal);
        } else {
          try {
            const pending = await this.client.pending();
            // A successful recovery may also read the list. Only that fresh
            // list plus this settled journal clears an earlier refresh error;
            // a detail GET alone must not restore list readiness.
            if (this.current(c.signal)) this.patch({ pending,
              refreshError: this.state().ready ? '' : this.state().refreshError });
          }
          catch (error) { if (this.current(c.signal)) this.patch({ error: automationErrorText(error), ready: false }); }
          if (this.current(c.signal)) this.patch({ busy: false });
        }
      }
    }
  }
  private current(signal: AbortSignal): boolean { return this.controller?.signal === signal && !signal.aborted; }
  private async list(signal: AbortSignal, retired: boolean, more = false): Promise<void> {
    const page = await this.client.list(retired, more ? this.state().nextAfter ?? undefined : undefined, signal);
    if (!this.current(signal)) return;
    const rules = more ? [...this.state().rules, ...page.rules] : page.rules;
    if (rules.length > 64 || new Set(rules.map(r => r.ruleId)).size !== rules.length) throw new Error('AUTOMATION_RESPONSE_INVALID');
    this.patch({ ready: true, rules, retired, nextAfter: page.nextAfter,
      choices: automationChoices(this.data.device?.dict, id => this.manifests.load(id)) });
  }
  async refresh(retired = this.state().retired): Promise<void> {
    await this.run(async signal => { this.patch({ ready: false, refreshError: '', detail: undefined, reviewed: undefined }); await this.list(signal, retired); });
  }
  private async refreshConfirmedList(signal: AbortSignal): Promise<void> {
    if (!this.current(signal)) return;
    this.patch({ busy: true, refreshing: true, ready: false, refreshError: '', rules: [], nextAfter: null });
    try { await this.list(signal, this.state().retired); }
    catch {
      if (this.current(signal)) this.patch({ ready: false,
        refreshError: '列表尚未更新；已确认的配置保持，不会重复提交。请重新读取列表。' });
    }
    // Preserve all other unresolved intents, even if the list read failed.
    if (!this.current(signal)) return;
    try { const pending = await this.client.pending(); if (this.current(signal)) this.patch({ pending }); }
    catch {
      if (this.current(signal)) this.patch({ ready: false,
        refreshError: '本地请求记录尚未读取；已确认的配置保持，未确认请求不会被清除。请重新读取列表。' });
    } finally {
      if (this.current(signal)) this.patch({ busy: false, refreshing: false });
    }
  }
  async retryRefresh(): Promise<void> {
    const c = this.controller;
    if (c && !this.state().busy && this.state().refreshError) await this.refreshConfirmedList(c.signal);
  }
  async more(): Promise<void> {
    if (this.state().nextAfter) await this.run(signal => this.list(signal, this.state().retired, true));
  }
  async inspect(ruleId: string): Promise<void> {
    await this.run(async signal => { const detail = await this.client.get(ruleId, signal); if (this.current(signal)) this.patch({ detail, reviewed: undefined }); });
  }
  get capabilityGuidance() { return automationCapabilityGuidance(this.data.device?.dict, id => this.manifests.load(id)); }
  get accountScope(): string | undefined {
    return this.data.auth?.uuid ? JSON.stringify([API.BASE_URL, this.data.auth.uuid, this.data.sessionEpoch]) : undefined;
  }
  deviceName(deviceId: string): string { return automationDeviceName(this.data.device?.dict, deviceId); }
  endpointLabel(endpoint: AutomationRule['source']): string {
    const types = ['boolean', 'int32', 'uint32', 'float32', 'float64'];
    const field = this.manifests.load(endpoint.deviceId)?.fields.find(f => f.key === endpoint.key && f.kind === 0 && types[f.type] === endpoint.valueType);
    const key = field ? capabilityDisplayName(this.data.device?.dict?.[endpoint.deviceId], field) : endpoint.key;
    return `${this.deviceName(endpoint.deviceId)} · ${key}`;
  }
  booleanLabel(endpoint: AutomationRule['source'] | undefined, value: boolean): string {
    const field = endpoint && this.manifests.load(endpoint.deviceId)?.fields.find(f => f.key === endpoint.key && f.kind === 0 && f.type === 0);
    return field && endpoint?.valueType === 'boolean'
      ? capabilityBooleanLabel(this.data.device?.dict?.[endpoint.deviceId], field, value) : value ? '开' : '关';
  }
  valueLabel(endpoint: AutomationRule['target']): string {
    return endpoint.valueType === 'boolean' ? this.booleanLabel(endpoint, endpoint.value) : String(endpoint.value);
  }
  targetChoice(endpoint: AutomationRule['source']): Pick<AutomationChoice, 'endpoint' | 'minimum' | 'maximum' | 'step'> {
    const manifest = this.manifests.load(endpoint.deviceId);
    const field = manifest?.fingerprint === endpoint.fingerprint && endpoint.valueType === 'uint32'
      ? manifest.fields.find(f => f.key === endpoint.key && f.kind === 0 && f.type === 2 && (f.access & 2) === 2) : undefined;
    return { endpoint, minimum: field?.constraints?.minimum, maximum: field?.constraints?.maximum, step: field?.constraints?.step };
  }
  async create(sourceId: string, targetId: string, value: boolean | number, condition: AutomationCondition, name?: string): Promise<boolean> {
    if (!this.state().ready || this.state().busy) return false;
    const source = this.state().choices.find(c => c.id === sourceId && c.source), target = this.state().choices.find(c => c.id === targetId && c.target);
    if (!source || !target || source.endpoint.deviceId === target.endpoint.deviceId) return false;
    let intent: AutomationIntent;
    try { intent = automationIntent({ ruleId: crypto.randomUUID(), operation: 'put', body: {
      expectedRevision: 0, enabled: false, source: source.endpoint,
      target: { ...target.endpoint, value: automationChoiceValue(target, value) }, policyVersion: 2, condition,
      ...(name === undefined ? {} : { name }) } }); }
    catch { this.patch({ error: automationErrorText(new Error('AUTOMATION_INVALID_INPUT')) }); return false; }
    return this.submit(intent);
  }
  async edit(rule: AutomationRule, name: string, condition: AutomationCondition, value: boolean | number): Promise<boolean> {
    if (!this.state().ready || this.state().busy || rule.retiredAtMs !== null) return false;
    let intent: AutomationIntent;
    try { intent = automationIntent({ ruleId: rule.ruleId, operation: 'put', body: {
      expectedRevision: rule.definitionRevision, enabled: rule.enabled, name, source: rule.source,
      target: { ...rule.target, value: automationChoiceValue(this.targetChoice(rule.target), value) }, policyVersion: 2, condition } }); }
    catch { this.patch({ error: automationErrorText(new Error('AUTOMATION_INVALID_INPUT')) }); return false; }
    return this.submit(intent);
  }
  async toggle(rule: AutomationRule): Promise<void> {
    if (!this.state().ready || rule.retiredAtMs !== null) return;
    await this.submit(automationIntent({ ruleId: rule.ruleId, operation: 'put', body: { expectedRevision: rule.definitionRevision,
      enabled: !rule.enabled, source: rule.source, target: rule.target,
      ...(rule.name === undefined ? {} : { name: rule.name }),
      ...(rule.policyVersion === 2 ? { policyVersion: 2, condition: rule.condition } : {}) } }));
  }
  async retire(rule: AutomationRule): Promise<void> {
    if (!this.state().ready || rule.retiredAtMs !== null) return;
    await this.submit({ ruleId: rule.ruleId, operation: 'retire', body: { expectedRevision: rule.definitionRevision } });
  }
  private async submit(intent: AutomationIntent): Promise<boolean> {
    const c = this.controller;
    let confirmed = false;
    await this.run(async signal => {
      const detail = await this.client.submit(intent, signal);
      if (!this.current(signal)) return;
      confirmed = true;
      this.patch({ detail, reviewed: undefined, notice: '配置已保存。',
        pending: this.state().pending.filter(pending => pending.ruleId !== intent.ruleId) });
    }, true);
    return confirmed && !!c && this.current(c.signal);
  }
  async recover(intent: AutomationIntent, retry = false): Promise<void> {
    await this.run(async signal => {
      const result = await this.client.recover(intent.ruleId, retry, signal);
      if (!this.current(signal)) return;
      this.patch({ detail: result.detail, reviewed: result.outcome === 'changed' ? intent : undefined,
        notice: result.outcome === 'confirmed' ? '已核对原请求，显示当前配置。' : result.outcome === 'changed'
          ? '规则已存在较新配置，请核对详情。不会自动覆盖或重发原操作。' : '尚未确认原写入；可稍后查询，或明确恢复同一请求。' });
      await this.list(signal, this.state().retired);
    });
  }
  async acceptChanged(intent: AutomationIntent): Promise<void> {
    await this.run(async signal => {
      const detail = await this.client.acceptChanged(intent, signal);
      if (this.current(signal)) this.patch({ detail, reviewed: undefined, notice: '仅停止本机请求跟踪；云端规则与执行没有被取消。' });
    });
  }
}
