import { API } from '../configs/api.config';
import type { PanelMode } from '../core/device-v2/custom-panel';
import type { BlinkerDevice } from '../core/model/device.model';

function preferenceKey(device: BlinkerDevice): string {
  return `blinker-device-panel-mode:${API.BASE_URL}:${device.id || device.deviceName}`;
}

export function readDevicePanelMode(device?: BlinkerDevice): PanelMode {
  const defaultMode = device?.config.panelMode || 'normal';

  if (!device?.config.isShared) return defaultMode;

  let mode = defaultMode;

  try {
    const saved = localStorage.getItem(preferenceKey(device));

    if (saved === 'normal' || saved === 'custom') mode = saved;
  } catch {
    // Storage may be unavailable; the owner's default remains usable.
  }

  return mode;
}

export function saveSharedDevicePanelMode(device: BlinkerDevice, mode: PanelMode): boolean {
  try {
    localStorage.setItem(preferenceKey(device), mode);

    return true;
  } catch {
    return false;
  }
}
