import { defineConfig } from 'vitest/config';
import base from '../vitest.config';

// Core ports use the original relative vi.mock contract, which Angular's
// bundled unit-test runner intentionally does not support. Keep this list
// finite and leave real resource/template compilation to the Angular stage.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globals: true,
    maxWorkers: 1,
    setupFiles: ['tools/test-access-registration.setup.ts'],
    include: [
      'src/app/core/device-v2/account-peer-id.spec.ts',
      'src/app/core/device-v2/account-client.spec.ts',
      'src/app/core/device-v2/ready-waits.spec.ts',
      'src/app/core/protocol/device-v2/presence.spec.ts',
      'src/app/core/protocol/device-v2/session.spec.ts',
      'src/app/core/device-v2/ble-direct/access-registration-ports.spec.ts',
      'src/app/core/device-v2/ble-direct/bc5-acceptance-client.spec.ts',
      'src/app/core/device-v2/ble-direct/bc5-launch-profile.spec.ts',
      'src/app/core/device-v2/ble-direct/bc5-registered-presence.spec.ts',
      'src/app/core/device-v2/ble-direct/registration-presence-api.spec.ts',
      'src/app/core/protocol/device-v2/logical-device-reference.spec.ts',
      'src/app/core/device-v2/ble-direct/cloud-registration-install.spec.ts',
      'src/app/core/protocol/device-v2/direct-hello.spec.ts',
      'src/app/core/device-v2/provisioning/wifiprov-initial-cloud-observation.spec.ts',
      'src/app/core/services/device-v2-ble-access-registration.spec.ts',
    ],
  },
});
