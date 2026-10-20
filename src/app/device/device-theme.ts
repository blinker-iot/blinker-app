import { normalizeUiTheme, UiTheme } from '../core/device-v2/ui-theme';

// A per-device theme chosen on this browser; it overrides the layout's own theme.
export function readDeviceTheme(deviceId: string): UiTheme | undefined {
  try {
    return normalizeUiTheme(localStorage.getItem(`blinker-device-theme:${deviceId}`));
  } catch {
    return undefined;
  }
}

export function saveDeviceTheme(deviceId: string, theme: UiTheme | undefined): boolean {
  try {
    if (theme) localStorage.setItem(`blinker-device-theme:${deviceId}`, theme);
    else localStorage.removeItem(`blinker-device-theme:${deviceId}`);
    return true;
  } catch {
    return false;
  }
}
