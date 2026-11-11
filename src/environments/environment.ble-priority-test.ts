// Explicit maintainer-only Android USB experiment, never a default profile.
import { environment as device } from './environment.local-device';

export const environment = {
  ...device,
  deviceV2BleBootstrapPriorityEnabled: true,
};
