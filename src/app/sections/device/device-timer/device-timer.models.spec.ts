import { taskEntryState, taskErrorText } from './device-timer.models';

describe('task entry describes query eligibility, not cached permission or capacity', () => {
  it.each([
    [undefined, '尚未找到设备'],
    [{ config: { mode: 'bbp2', isPreview: true } }, '预览设备'],
    [{ config: { mode: 'bbp2', isShared: true } }, '所有者'],
    [{ config: { mode: 'bbp2', disabled: true } }, '设备已停用'],
    [{ config: { mode: 'json' } }, '未使用 BBP/2'],
    [{ config: { mode: 'bbp2' }, deviceType: 'ble' }, 'BLE 设备'],
    [{ config: { mode: 'bbp2' }, deviceType: 'edge-hub' }, '网关设备'],
    [{ config: { mode: 'bbp2' }, gatewayRouted: true }, '网关子设备'],
    [{ config: { mode: 'bbp2' }, deviceType: 'ble', gatewayRouted: true }, '网关子设备'],
  ] as const)('rejects unsupported entry %j with its actual reason', (device, reason) => {
    const state = taskEntryState(device);
    expect(state.available).toBe(false); expect(state.description).toContain(reason);
    expect(state.description).not.toContain('0 条');
  });
  it('allows querying an owned WiFi entry without asserting task support, time readiness or four slots', () => {
    const state = taskEntryState({ config: { mode: 'bbp2' } });
    expect(state.available).toBe(true); expect(state.description).toContain('查询结果');
    expect(state.description).not.toContain('已支持'); expect(state.description).not.toContain('授时');
    expect(state.description).not.toContain('4');
  });
  it('distinguishes service and catalog/table unavailability from an empty or stopped device task table', () => {
    expect(taskErrorText(new Error('TASK_UNAVAILABLE'))).toContain('不代表设备离线');
    expect(taskErrorText(new Error('TASK_UNAVAILABLE'))).toContain('任务已停止');
    for (const code of ['TASK_CATALOG_UNAVAILABLE', 'TASK_CATALOG_INVALID'])
      expect(taskErrorText(new Error(code))).toContain('容量和可用属性尚未确认');
    expect(taskErrorText(new Error('TASK_TABLE_UNAVAILABLE'))).toContain('不能据此判断任务为空或已停止');
    expect(taskErrorText(new Error('TASK_TABLE_CHANGED'))).toContain('手动刷新');
  });
});
