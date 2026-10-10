import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { AutomationCondition, AutomationIntent, AutomationRule, automationCondition, automationName } from '../../../core/device-v2/automation/contract';
import { AutomationService } from './automation.service';
import { automationConditionText, automationExecutionText, automationRuleStatus, automationStatusText, automationTriggerText } from './automation.models';

@Component({ selector: 'app-automation', templateUrl: './automation.page.html', styleUrls: ['./automation.page.scss'],
  imports: [IonicModule, FormsModule, DatePipe, RouterLink], providers: [AutomationService] })
export class AutomationPage {
  private generation = 0;
  view: 'list' | 'editor' | 'detail' = 'list';
  editing?: AutomationRule;
  name = ''; source = ''; target = ''; value = true;
  condition: 'rising' | 'falling' | 'above' | 'below' = 'rising';
  threshold: number | null = null; hysteresis: number | null = null;
  readonly statusText = automationStatusText; readonly executionText = automationExecutionText;
  readonly conditionText = automationConditionText; readonly triggerText = automationTriggerText;
  readonly ruleStatus = automationRuleStatus;
  constructor(readonly automation: AutomationService, private readonly alerts: AlertController) {}
  ionViewWillEnter(): void { ++this.generation; this.backToList(); void this.automation.open(); }
  ionViewWillLeave(): void { ++this.generation; this.backToList(); this.automation.close(); }
  ngOnDestroy(): void { this.ionViewWillLeave(); }
  get sources() { return this.automation.state().choices.filter(c => c.source); }
  get numericSource(): boolean {
    const endpoint = this.editing?.source ?? this.sources.find(choice => choice.id === this.source)?.endpoint;
    return !!endpoint && endpoint.valueType !== 'boolean';
  }
  get conditionValue(): AutomationCondition | undefined {
    if (!this.editing && !this.sources.some(choice => choice.id === this.source)) return undefined;
    if (this.numericSource ? !['above', 'below'].includes(this.condition) : !['rising', 'falling'].includes(this.condition)) return undefined;
    try { return automationCondition(this.numericSource
      ? { kind: 'numeric-threshold', direction: this.condition, threshold: this.threshold, hysteresis: this.hysteresis }
      : { kind: 'boolean-edge', direction: this.condition }); }
    catch { return undefined; }
  }
  get validName(): string | undefined { try { return automationName(this.name); } catch { return undefined; } }
  sourceChanged(): void {
    this.condition = this.numericSource ? 'above' : 'rising'; this.threshold = null; this.hysteresis = null;
    if (!this.targets.some(choice => choice.id === this.target)) this.target = '';
  }
  get targets() {
    const source = this.sources.find(c => c.id === this.source);
    return this.automation.state().choices.filter(c => c.target && c.endpoint.deviceId !== source?.endpoint.deviceId);
  }
  get canStartCreate(): boolean {
    const s = this.automation.state();
    return s.ready && !s.busy && !s.retired && s.rules.length < 4
      && !s.pending.some(p => p.operation === 'put' && p.body.expectedRevision === 0);
  }
  get canCreate(): boolean {
    return this.canStartCreate && !!this.validName && this.sources.some(c => c.id === this.source)
      && this.targets.some(c => c.id === this.target) && !!this.conditionValue;
  }
  get canSave(): boolean {
    if (!this.editing) return this.canCreate;
    const s = this.automation.state();
    return s.ready && !s.busy && this.editing.retiredAtMs === null && !this.hasPending(this.editing.ruleId)
      && !!this.validName && !!this.conditionValue;
  }
  hasPending(ruleId: string): boolean { return this.automation.state().pending.some(p => p.ruleId === ruleId); }
  ruleTitle(rule: AutomationRule): string {
    return rule.name || `${this.automation.endpointLabel(rule.source)}${this.triggerText(rule.condition)} → ${this.automation.deviceName(rule.target.deviceId)}`;
  }
  actionText(rule: AutomationRule): string { return `${this.automation.endpointLabel(rule.target)}：${rule.target.value ? '开' : '关'}`; }
  private resetForm(): void {
    this.editing = undefined; this.name = ''; this.source = ''; this.target = ''; this.value = true;
    this.condition = 'rising'; this.threshold = null; this.hysteresis = null;
  }
  backToList(): void { ++this.generation; this.resetForm(); this.view = 'list'; }
  async leaveView(): Promise<void> {
    if (this.view === 'editor' && this.draftChanged && !(await this.confirm('放弃尚未保存的修改？'))) return;
    this.backToList();
  }
  get draftChanged(): boolean {
    if (!this.editing) return !!(this.name || this.source || this.target || this.threshold !== null || this.hysteresis !== null || !this.value);
    const original = this.editing.condition === 'rising-boolean' ? { kind: 'boolean-edge', direction: 'rising' } : this.editing.condition;
    return this.name !== (this.editing.name || '') || this.value !== this.editing.target.value
      || JSON.stringify(this.conditionValue) !== JSON.stringify(original);
  }
  startCreate(): void { if (this.canStartCreate) { ++this.generation; this.resetForm(); this.view = 'editor'; } }
  async refresh(): Promise<void> {
    const detail = this.automation.state().detail;
    if (this.view === 'detail' && detail) { await this.inspect(detail.rule); return; }
    this.backToList(); await this.automation.refresh();
  }
  async showHistory(): Promise<void> { this.backToList(); await this.automation.refresh(!this.automation.state().retired); }
  async inspect(rule: AutomationRule): Promise<void> {
    const generation = this.generation;
    await this.automation.inspect(rule.ruleId);
    if (generation === this.generation && !this.automation.state().error && this.automation.state().detail?.rule.ruleId === rule.ruleId) this.view = 'detail';
  }
  async startEdit(rule: AutomationRule): Promise<void> {
    if (rule.retiredAtMs !== null || this.hasPending(rule.ruleId)) return;
    const generation = this.generation;
    await this.automation.inspect(rule.ruleId);
    if (generation !== this.generation || this.automation.state().error) return;
    const current = this.automation.state().detail?.rule;
    if (!current || current.ruleId !== rule.ruleId || current.retiredAtMs !== null || this.hasPending(rule.ruleId)) return;
    this.resetForm(); this.editing = current; this.name = current.name || '';
    this.value = current.target.value;
    const condition = current.condition === 'rising-boolean' ? { kind: 'boolean-edge' as const, direction: 'rising' as const } : current.condition;
    this.condition = condition.direction;
    if (condition.kind === 'numeric-threshold') { this.threshold = condition.threshold; this.hysteresis = condition.hysteresis; }
    this.view = 'editor';
  }
  async save(): Promise<void> {
    const condition = this.conditionValue, name = this.validName, generation = this.generation, editing = this.editing;
    if (!this.canSave || !condition || !name) return;
    if (editing?.enabled && !(await this.confirm('此规则已启用。保存后将继续启用，并重新等待源设备数据；已经发出的动作不会撤回。'))) return;
    if (generation !== this.generation || !this.canSave) return;
    const saved = editing ? await this.automation.edit(editing, name, condition, this.value)
      : await this.automation.create(this.source, this.target, this.value, condition, name);
    if (saved && generation === this.generation) { this.resetForm(); this.view = 'detail'; }
  }
  pendingCondition(intent: AutomationIntent): string {
    return intent.operation === 'retire' ? '' : this.conditionText('policyVersion' in intent.body ? intent.body.condition : 'rising-boolean');
  }
  private async confirm(message: string): Promise<boolean> {
    const generation = this.generation;
    const dialog = await this.alerts.create({ header: '请确认', message,
      buttons: [{ text: '取消', role: 'cancel' }, { text: '确认', role: 'confirm' }] });
    await dialog.present(); const result = await dialog.onDidDismiss();
    return generation === this.generation && result.role === 'confirm';
  }
  async retire(rule: AutomationRule): Promise<void> {
    const generation = this.generation;
    if (await this.confirm('删除后规则将停止新执行，不能重新启用；已发出的命令不会撤回，执行历史和待确认结果会保留。')) {
      await this.automation.retire(rule);
      if (generation === this.generation && !this.automation.state().error) this.backToList();
    }
  }
  async query(intent: AutomationIntent): Promise<void> {
    const generation = this.generation;
    await this.automation.recover(intent);
    if (generation === this.generation && !this.automation.state().error && this.automation.state().detail?.rule.ruleId === intent.ruleId) this.view = 'detail';
  }
  async retry(intent: AutomationIntent): Promise<void> {
    const generation = this.generation;
    if (await this.confirm('将先查询，再尝试恢复原来的保存操作，可能改变规则的启停状态。不会创建重复规则。')) {
      await this.automation.recover(intent, true);
      if (generation === this.generation && !this.automation.state().error && this.automation.state().detail?.rule.ruleId === intent.ruleId) this.view = 'detail';
    }
  }
  async acceptChanged(intent: AutomationIntent): Promise<void> {
    if (await this.confirm('已核对较新配置，仅停止本机原请求跟踪；不会取消云端规则或设备动作。')) await this.automation.acceptChanged(intent);
  }
}
