import { DeviceSettingsPage } from './device-settings';

// Exercise the production menu getters without starting account/device services.
function page(shared = false) {
  const instance = Object.create(DeviceSettingsPage.prototype) as DeviceSettingsPage;
  Object.assign(instance, {
    id: 'device_a',
    device: { deviceName: 'device_a', config: { mode: 'bbp2', isShared: shared,
      position: { location: [120.123456, 30.654321] } }, data: {} },
    deviceShortcutService: { isAvailable: false },
    dataService: { roomRevision: 1, room: { list: ['厨房'], dict: { 厨房: ['device_a'] } } },
  });
  return instance;
}

describe('Device settings truthfulness', () => {
  it('describes manual geographic position separately from account regions', () => {
    const entry = page().deviceMenuItems.find(item => item.id === 'location')!;
    expect(entry.title).toBe('地理位置');
    expect(entry.description).toBe('在地图上查看或调整设备位置');
    expect(entry.description).not.toContain('更新设备所在位置');
    expect(entry.route).toBe('/device-manager/device_a/location');
  });

  it('does not put shared-device coordinates into its menu or promise editing rights', () => {
    const entry = page(true).deviceMenuItems.find(item => item.id === 'location')!;
    expect(entry.description).toContain('暂不向分享用户开放');
    expect(JSON.stringify(entry)).not.toMatch(/120\.123456|30\.654321/);
    expect(entry.route).toBe('/device-manager/device_a/location');
  });

  it('keeps the existing route and describes only retained cloud command delivery', () => {
    const entry = page().deviceMenuItems.find(item => item.id === 'logs')!;
    expect(entry.title).toBe('活动记录');
    expect(entry.description).toBe('查看最近 7 天保留的云端控制投递');
    expect(entry.route).toBe('/device-manager/device_a/logs');
    expect(page(true).deviceMenuItems.find(item => item.id === 'logs')!.description).toBe('活动记录暂不向分享用户开放');
  });

  it('preserves the separate personal region entry for owned and shared devices', () => {
    for (const shared of [false, true]) {
      const entry = page(shared).managementMenuItems.find(item => item.id === 'rooms')!;
      expect(entry.title).toBe('所属区域');
      expect(entry.description).toBe('厨房');
      expect(entry.disabled).toBe(false);
    }
  });
});
