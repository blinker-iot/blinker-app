import { TaskCatalog, TaskDefinition, TaskRecord } from '../../../core/device-v2/tasks/contract';
import { DeviceV2Manifest, DeviceV2ManifestConstraints } from '../../../core/protocol/device-v2/types';

export type TaskTarget = TaskCatalog['targets'][number] & { constraints?: DeviceV2ManifestConstraints };
const types: readonly string[] = ['boolean', 'int', 'uint', 'float32', 'float64'];

// Cached Manifest constraints are display hints, never scheduling permission.
// The fresh authenticated catalog is authoritative; MCU revalidates the value.
export function taskTargets(catalog: TaskCatalog, manifest?: DeviceV2Manifest): TaskTarget[] {
  return catalog.targets.map(target => {
    const field = manifest?.fields.find(f => f.key === target.key && f.kind === 0
      && (f.access & 2) !== 0 && types[f.type] === target.valueType);
    return { ...target, constraints: field?.constraints };
  });
}
export function taskScheduleText(record: TaskRecord): string {
  const schedule = record.definition.schedule;
  if (schedule.kind === 'countdown') return `${schedule.durationMillis / 1000} 秒倒计时`;
  if (schedule.kind === 'once') return new Date(schedule.utcMillis).toLocaleString();
  const days = ['一', '二', '三', '四', '五', '六', '日'].filter((_, i) => (schedule.weekdays & (1 << i)) !== 0);
  const offset = schedule.utcOffsetMinutes;
  return `${String(Math.floor(schedule.minuteOfDay / 60)).padStart(2, '0')}:${String(schedule.minuteOfDay % 60).padStart(2, '0')} 周${days.join('、')} UTC${offset >= 0 ? '+' : '-'}${Math.floor(Math.abs(offset) / 60)}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
}
export function taskProgressText(record: TaskRecord): string {
  // None is absence of an execution record, not proof of a future deadline.
  // A calendar occurrence missed while UTC was unavailable is not caught up.
  const idle = record.definition.schedule.kind === 'countdown' ? '等待手动开始' : '尚无执行记录';
  const progress = [idle, '倒计时已开始', '执行结果未知，不自动重放', '本次执行已完成', '执行失败', '本次已跳过', '已中止，需明确重新开始'];
  return `${record.definition.enabled ? '已启用' : '已停用'} · ${progress[record.progress] ?? '未知状态'}`;
}
export function taskErrorCode(error: unknown): string {
  const e = error as { code?: string; error?: { errorCode?: string }; message?: string };
  return e?.code ?? e?.error?.errorCode ?? e?.message ?? '';
}
export function taskErrorText(error: unknown): string {
  const code = taskErrorCode(error);
  const messages: Record<string, string> = {
    TASK_SCOPE_REQUIRED: '设备尚未启用本机任务，请明确确认后启用。',
    TASK_AUTHORITY_REQUIRED: '任务授权尚未就绪，请确认后启用/同步授权。',
    TASK_AUTHORITY_ALREADY_CURRENT: '当前任务授权已有确认，请重新查询核对；不会自动清除未确认请求。',
    TASK_AUTHORITY_RECOVERY_UNSUPPORTED: '此前的任务授权初始化或同步尚未确认，且设备 Key 已变更。当前试点暂不支持恢复此状态；原请求与日志已保留，不会自动重新初始化或重试。',
    TASK_INTENT_HELD: '原操作已暂停重提，请查询任务并明确核对。同步授权不会重发原操作。',
    TASK_REQUEST_CONFLICT: '原请求与当前授权或参数不一致，请查询核对。不会替换请求号或自动重发；刷新 Key 不会自动恢复未确认的任务授权。',
    TASK_PROFILE_NOT_ADMITTED: '本设备暂未开放任务管理试点。',
    TASK_FORBIDDEN: '只有当前设备所有者可以管理任务。',
    TASK_HISTORY_EXPIRED: '原请求历史已过期。先刷新核对任务，不能自动重新开始。',
    TASK_JOURNAL_CAPACITY: '任务管理请求额度已满，请稍后手动刷新；不会清除未确认请求。',
    TASK_JOURNAL_UNAVAILABLE: '请求日志未能确认持久保存或清理，请检查存储空间或更新系统 WebView；先恢复记录，不要重复创建相同操作。',
    TASK_RATE_LIMITED: '请求过快，请稍后手动重试。',
    TASK_BUSY: '设备管理繁忙，请稍后手动重试。',
    TASK_IN_FLIGHT: '原请求仍在处理中，请稍后核对。',
    TASK_DEVICE_OFFLINE: '设备当前没有可用的云端连接，请等待设备上线后手动查询。原未确认请求仍保留，不会自动重发。',
    TASK_CONNECTION_NOT_READY: '设备云端连接尚未就绪，请稍后手动查询。这不是设备任务额度或冷却限制。',
    TASK_CONNECTION_AMBIGUOUS: '设备存在多个云端连接，暂不能确定任务通道，请稍后手动查询。不会自动选择连接或重发操作。',
    TASK_CONNECTION_CHANGED: '设备云端连接或协商状态已变化，请稍后手动查询；原未确认请求仍保留。',
    TASK_OUTCOME_UNKNOWN: '尚未取得可验证的操作结果，请先查询当前任务。恢复原请求可能在限制解除后执行，不是只读查询。',
    TASK_ATTEMPT_WRITE_BUDGET: '设备已确认本次尝试因写入额度不足被拒绝；原请求此前是否执行仍需核对。记录已保留，不会自动重发。',
    TASK_ATTEMPT_START_COOLDOWN: '设备已确认本次尝试仍在开始冷却期，未重新开始；原请求此前是否执行仍需核对。记录已保留，不会自动重发。',
    TASK_RETRY_LIMIT: '原请求重试次数已用完，请先刷新核对任务。',
    TASK_CONTRACT_INVALID: '参数或响应不符合任务合同，请核对数值和时间。',
    TASK_ACCOUNT_CHANGED: '账号会话已变化，请重新进入任务页面。',
    TASK_PAGE_UNAVAILABLE: '仅支持当前账号拥有的普通 WiFi 设备；预览、分享和网关任务暂未开放。',
    TASK_TABLE_CHANGED: '任务表已变化，请手动刷新后再操作。',
    TASK_TARGET_UNAVAILABLE: '固件没有允许这个属性参与定时，请刷新后检查设备代码。',
  };
  return messages[code] ?? '未能确认操作结果，请检查连接并刷新。未确认写入会保留，不会自动重发。';
}
export function taskValue(target: TaskTarget, input: string | boolean): TaskDefinition['value'] {
  if (target.valueType === 'boolean') {
    if (typeof input !== 'boolean') throw new Error('TASK_CONTRACT_INVALID');
    return input;
  }
  if (typeof input !== 'string' || input.trim() === '') throw new Error('TASK_CONTRACT_INVALID');
  const value = Number(input);
  if (!Number.isFinite(value)) throw new Error('TASK_CONTRACT_INVALID');
  return value; // Exact scalar widths/ranges are checked by the shared contract.
}
