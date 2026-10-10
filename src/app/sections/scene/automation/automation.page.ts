import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule } from '@ionic/angular';
import { AutomationCondition, AutomationIntent, AutomationRule, automationCondition } from '../../../core/device-v2/automation/contract';
import { AutomationService } from './automation.service';
import { automationConditionText, automationExecutionText, automationStatusText } from './automation.models';
@Component({ selector: 'app-automation', templateUrl: './automation.page.html', styleUrls: ['./automation.page.scss'],
  imports: [IonicModule, FormsModule, DatePipe], providers: [AutomationService] })
export class AutomationPage {
  private generation = 0;
  source = ''; target = ''; value = true;
  condition: 'rising' | 'falling' | 'above' | 'below' = 'rising';
  threshold: number | null = null; hysteresis: number | null = null;
  readonly statusText = automationStatusText; readonly executionText = automationExecutionText;
  readonly conditionText = automationConditionText;
  constructor(readonly automation: AutomationService, private readonly alerts: AlertController) {}
  ionViewWillEnter(): void { ++this.generation; this.resetForm(); void this.automation.open(); }
  ionViewWillLeave(): void { ++this.generation; this.automation.close(); }
  ngOnDestroy(): void { this.ionViewWillLeave(); }
  get sources() { return this.automation.state().choices.filter(c => c.source); }
  get numericSource(): boolean { const source = this.sources.find(choice => choice.id === this.source);
    return !!source && source.endpoint.valueType !== 'boolean'; }
  get conditionValue(): AutomationCondition | undefined {
    if (!this.sources.some(choice => choice.id === this.source)) return undefined;
    if (this.numericSource ? !['above', 'below'].includes(this.condition) : !['rising', 'falling'].includes(this.condition)) return undefined;
    try { return automationCondition(this.numericSource
      ? { kind: 'numeric-threshold', direction: this.condition, threshold: this.threshold, hysteresis: this.hysteresis }
      : { kind: 'boolean-edge', direction: this.condition }); }
    catch { return undefined; }
  }
  sourceChanged(): void {
    this.condition = this.numericSource ? 'above' : 'rising'; this.threshold = null; this.hysteresis = null;
    if (!this.targets.some(choice => choice.id === this.target)) this.target = '';
  }
  get targets() {
    const source = this.sources.find(c => c.id === this.source);
    return this.automation.state().choices.filter(c => c.target && c.endpoint.deviceId !== source?.endpoint.deviceId);
  }
  get canCreate(): boolean {
    const s = this.automation.state();
    return s.ready && !s.busy && !s.retired && s.rules.length < 4 && this.sources.some(c => c.id === this.source)
      && this.targets.some(c => c.id === this.target) && !!this.conditionValue
      && !s.pending.some(p => p.operation === 'put' && p.body.expectedRevision === 0);
  }
  hasPending(ruleId: string): boolean { return this.automation.state().pending.some(p => p.ruleId === ruleId); }
  private resetForm(): void { this.source = ''; this.target = ''; this.condition = 'rising'; this.threshold = null; this.hysteresis = null; }
  async refresh(): Promise<void> { this.resetForm(); await this.automation.refresh(); }
  async save(): Promise<void> {
    const condition = this.conditionValue;
    if (this.canCreate && condition) await this.automation.create(this.source, this.target, this.value, condition);
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
    if (await this.confirm('退役后不能重新启用。它会停止新执行，但不能撤回已发出的命令；历史和未知预约仍保留。')) await this.automation.retire(rule);
  }
  async retry(intent: AutomationIntent): Promise<void> {
    if (await this.confirm('先查询当前配置；只有原版本仍可写时，才恢复同一请求。这不是只读操作，可能启用或停用规则。')) await this.automation.recover(intent, true);
  }
  async acceptChanged(intent: AutomationIntent): Promise<void> {
    if (await this.confirm('已核对较新配置，仅停止本机原请求跟踪；不会取消云端规则或设备动作。')) await this.automation.acceptChanged(intent);
  }
}
