import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function cloudBetaEnvironment(env) {
  if ((env.BLINKER_APP_PROFILE && env.BLINKER_APP_PROFILE !== 'cloud-beta') ||
      env.BLINKER_LOCAL_CLEARTEXT === '1' || env.BLINKER_DEBUG_NETWORK_CONFIG_DIR) {
    throw new Error('Cloud beta forbids conflicting profile or local network trust');
  }
  return { ...env, BLINKER_APP_PROFILE: 'cloud-beta' };
}

export function verifyNativeInputs(config, plugins) {
  if (config.appId !== 'iot.diandeng.tech.beta' || config.loggingBehavior !== 'none' ||
      config.server?.androidScheme !== 'https' || config.server?.cleartext !== false ||
      config.server?.url || !Array.isArray(plugins) ||
      !plugins.some(p => p.pkg === '@aparajita/capacitor-secure-storage' && p.classpath)) {
    throw new Error('Incomplete cloud beta native config or plugin registry');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.execPath,
    [resolve(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'],
    { cwd: root, env: cloudBetaEnvironment(process.env), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const assets = resolve(root, 'android/app/src/main/assets');
  verifyNativeInputs(
    JSON.parse(readFileSync(resolve(assets, 'capacitor.config.json'), 'utf8')),
    JSON.parse(readFileSync(resolve(assets, 'capacitor.plugins.json'), 'utf8')),
  );
}
