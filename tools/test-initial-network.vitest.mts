import { defineConfig } from 'vitest/config';
import base from '../vitest.config';

export default defineConfig({
  ...base,
  test: { ...base.test, maxWorkers: 1, globals: true,
    setupFiles: ['tools/test-access-registration.setup.ts'],
    include: [
      'src/app/core/device-v2/ble-direct/initial-cloud-network.spec.ts',
      'src/app/core/device-v2/ble-direct/initial-network-checkpoint.spec.ts',
      'src/app/core/device-v2/ble-direct/initial-network-run.spec.ts',
      'src/app/core/device-v2/provisioning/wifiprov-initial-cloud-carrier.spec.ts',
      'src/app/core/device-v2/provisioning/wifiprov-initial-cloud-observation.spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/build/**'],
  },
});
