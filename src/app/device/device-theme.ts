export type DeviceTheme = 'clear' | 'sand' | 'graphite';

export const DEVICE_THEMES: ReadonlyArray<{ id: DeviceTheme; name: string; description: string }> = [
  { id: 'clear', name: '清透蓝', description: '明亮清晰 · 日常控制' },
  { id: 'sand', name: '暖砂', description: '柔和暖色 · 家居空间' },
  { id: 'graphite', name: '石墨', description: '深色低光 · 专注数据' },
];

export function readDeviceTheme(deviceId: string): DeviceTheme | undefined {
  try {
    const stored = localStorage.getItem(`blinker-device-theme:${deviceId}`);
    return DEVICE_THEMES.find(theme => theme.id === stored)?.id;
  } catch {
    return undefined;
  }
}

export function saveDeviceTheme(deviceId: string, theme: DeviceTheme | undefined): boolean {
  try {
    if (theme) localStorage.setItem(`blinker-device-theme:${deviceId}`, theme);
    else localStorage.removeItem(`blinker-device-theme:${deviceId}`);
    return true;
  } catch {
    return false;
  }
}
