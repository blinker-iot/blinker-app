import { AutomationCondition, AutomationEndpoint, AutomationExecution, AutomationRule, AutomationScalarType,
  AutomationStatus, automationErrorCode } from '../../../core/device-v2/automation/contract';
import { DeviceV2Manifest } from '../../../core/protocol/device-v2/types';
export interface AutomationChoice { id: string; label: string; endpoint: AutomationEndpoint; source: boolean; target: boolean; }
const scalarTypes: readonly AutomationScalarType[] = ['boolean', 'int32', 'uint32', 'float32', 'float64'];
export function automationDeviceName(devices: Record<string, any>, deviceId: string): string {
  const name = devices?.[deviceId]?.config?.customName;
  if (typeof name === 'string' && name.trim()) return name;
  const index = Object.keys(devices || {}).sort().indexOf(deviceId);
  return index < 0 ? '设备不在当前列表' : `未命名设备 ${index + 1}`;
}
export function automationChoices(devices: Record<string, any>, manifest: (id: string) => DeviceV2Manifest | undefined): AutomationChoice[] {
  const choices: AutomationChoice[] = [];
  for (const [deviceId, device] of Object.entries(devices || {})) {
    if (device?.deviceType !== 'diy' || device.gatewayRouted || device.config?.mode !== 'bbp2'
      || device.config.isShared || device.config.isPreview || device.config.disabled) continue;
    const m = manifest(deviceId); if (!m) continue;
    for (const field of m.fields) {
      if (!Number.isInteger(field.type) || field.type < 0 || field.type >= scalarTypes.length) continue;
      const valueType = scalarTypes[field.type];
      if (field.kind !== 0 || !valueType) continue;
      const source = (field.access & 5) === 5, target = valueType === 'boolean' && (field.access & 2) === 2;
      if (source || target) choices.push({ id: `${deviceId}:${field.id}`,
        label: `${automationDeviceName(devices, deviceId)} · ${field.key}`,
        endpoint: { deviceId, key: field.key, fingerprint: m.fingerprint, valueType }, source, target });
    }
  }
  return choices; // Cached selection only. Gateway rechecks live permissions and capabilities.
}
export function automationConditionText(condition: AutomationRule['condition'] | AutomationCondition): string {
  if (condition === 'rising-boolean') return '从关变为开';
  if (condition.kind === 'boolean-edge') return condition.direction === 'rising'
    ? '从关变为开' : '从开变为关';
  return condition.direction === 'above'
    ? `升至 ${condition.threshold} 或以上；降至 ${condition.threshold - condition.hysteresis} 后可再次触发`
    : `降至 ${condition.threshold} 或以下；升至 ${condition.threshold + condition.hysteresis} 后可再次触发`;
}
export function automationTriggerText(condition: AutomationRule['condition'] | AutomationCondition): string {
  if (condition === 'rising-boolean' || condition.kind === 'boolean-edge') return automationConditionText(condition);
  return condition.direction === 'above' ? `升至 ${condition.threshold} 或以上` : `降至 ${condition.threshold} 或以下`;
}
// Enabled is configuration, not evidence of device presence or recent execution.
export function automationRuleStatus(rule: AutomationRule): string {
  if (rule.retiredAtMs !== null) return '已删除';
  if (rule.targetOutcomeUnknown || rule.status === 'execution-unknown') return `${rule.enabled ? '已启用' : '未启用'} · 上次执行待确认`;
  if (!rule.enabled) return '未启用';
  return rule.status === 'waiting-baseline' ? '已启用 · 等待首次数据' : '已启用';
}
export const automationStatusText: Record<AutomationStatus, string> = { disabled: '已保存 · 停用', 'waiting-baseline': '等待源设备基线',
  observing: '近期收到源设备数据', paused: '暂无近期观察确认（不代表停用或离线）', 'execution-unknown': '目标执行结果未知', retired: '已删除，历史保留' };
export const automationExecutionText: Record<AutomationExecution['state'], string> = { prepared: '待准入，尚未发送', dispatching: '投递结果确认中',
  acknowledged: '设备已确认', rejected: '设备拒绝', outcome_unknown: '结果未知，不自动重发', expired: '未发送，已过期', cancelled: '未发送，已取消' };
export function automationErrorText(error: unknown): string {
  const messages: Record<string, string> = {
    AUTOMATION_UNAVAILABLE: '服务器尚未开启自动化或暂时不可用。', HTTP_404: '当前服务器尚未提供自动化管理入口。',
    AUTOMATION_FORBIDDEN: '仅设备所属账号可管理自动化，分享权限不包含规则管理。',
    AUTOMATION_REVISION: '规则版本已变化，请查询当前配置后明确确认，不会自动覆盖。',
    AUTOMATION_PENDING_CREATE: '已有未确认的新建请求，请先核对原规则，不能换一个 ID 重建。',
    AUTOMATION_PENDING_INTENT: '此规则已有未确认操作，请先查询原请求。',
    AUTOMATION_CAPACITY: '规则名额已满，可先停用并退役不再使用的规则。',
    AUTOMATION_STORAGE_CAPACITY: '自动化保留记录已达试点上限，不能通过删除历史绕过。',
    AUTOMATION_CAPABILITY_CHANGED: '设备能力已变化，请重新读取设备能力，再核对规则端点。',
    AUTOMATION_CAPABILITY_REQUIRED: '设备当前能力尚未就绪，请确认两台设备在线。',
    AUTOMATION_PROFILE: '当前试点仅支持同账号的普通 WiFi 设备，不包含网关和子设备。',
    AUTOMATION_DUPLICATE_RULE: '已有相同规则，请使用现有规则，不重复创建。',
    AUTOMATION_TARGET_CONFLICT: '目标属性已被其他规则使用，请检查现有配置。',
    AUTOMATION_CHAIN_FORBIDDEN: '当前试点不支持连锁自动化，请选择独立的源和目标。',
    AUTOMATION_RATE_LIMITED: '请求过于频繁，请稍后再操作。',
    AUTOMATION_JOURNAL_UNAVAILABLE: '请求日志无法持久保存或清理，请检查存储空间和 WebView；不会换 ID 重发。',
    AUTOMATION_JOURNAL_INVALID: '本机请求记录损坏，已停止新写入；请保留数据排查。',
    AUTOMATION_ACCOUNT_CHANGED: '账号已变化，请重新进入自动化页面。',
    AUTOMATION_BUSY: '上一项操作尚未结束，请稍后再试。',
    AUTOMATION_NOT_FOUND: '规则不存在或当前账号不可访问，请核对原请求。',
    AUTOMATION_INVALID_INPUT: '名称、条件或阈值/回差无效；未发送新请求。',
    AUTOMATION_UNSUPPORTED_VERSION: '服务器与规则版本不匹配，不会降级重发；未确认的原请求请保留排查。',
    AUTOMATION_WRITE_NOT_CONFIRMED: '返回配置尚未确认与原请求一致；请求记录已保留，请查询原请求。',
    AUTOMATION_RESPONSE_INVALID: '服务器回复无法按规则合同校验，请保留原请求排查，不会猜测或转换条件。',
  };
  return messages[automationErrorCode(error)] || '尚未确认操作结果，请刷新核对。未确认请求会保留，不会自动重发。';
}
