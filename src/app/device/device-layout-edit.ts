import type { BlinkerDevice } from '../core/model/device.model';

export function canEditDeviceLayout(
  device: BlinkerDevice | undefined,
  component: string,
): boolean {
  if (!device || device.config.isShared || !component.includes('Layouter')) {
    return false;
  }

  return true;
}
