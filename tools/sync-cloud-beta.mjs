import { spawnSync } from 'node:child_process';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const admissionKeys = ['origin', 'ownerUserId', 'tenantId', 'region', 'intentId', 'sourceLogicalDeviceId', 'expiresAt'];
const admissionError = () => new Error('BC-5 requires an exact non-secret admission in an explicit local file');
const maxAdmissionBytes = 2048;
const networkError = () => new Error('Initial network recovery requires an exact non-secret admission in an explicit local file');
const networkOperationKeys = ['contract', 'operationId', 'sourceLogicalDeviceId', 'targetLogicalDeviceId', 'expectedRoot',
  'existingLocator', 'expiresAt', 'origin', 'region', 'tenantId', 'ownerUserId', 'cloudCredentialVersion'];

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function binary(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === size && bytes.some(Boolean) && bytes.toString('base64url') === value;
}
function logicalReference(value) {
  if (typeof value !== 'string') return false;
  return /^device_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
    || (/^(?:device|ble)_[A-Za-z0-9_-]{22}$/.test(value) && binary(value.slice(value.indexOf('_') + 1), 16));
}
const u32 = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;

function initialNetworkMetadata(value) {
  try {
    if (!exactKeys(value, ['originalRecovery', 'operation'])) throw networkError();
    const originalRecovery = admissionMetadata(value.originalRecovery), next = value.operation;
    if (!exactKeys(next, networkOperationKeys)
      || next.contract !== 'blinker.installed-key-initial-network.v1'
      || !exactKeys(next.expectedRoot, ['deviceInstanceId', 'accessEpoch', 'controllerId', 'credentialVersion', 'adminFingerprint'])
      || !logicalReference(next.sourceLogicalDeviceId) || !logicalReference(next.targetLogicalDeviceId)
      || next.sourceLogicalDeviceId === next.targetLogicalDeviceId || !u32(next.cloudCredentialVersion)
      || !binary(next.existingLocator, 16)) throw networkError();
    const scope = admissionMetadata({ origin: next.origin, ownerUserId: next.ownerUserId, tenantId: next.tenantId,
      region: next.region, intentId: next.operationId, sourceLogicalDeviceId: next.sourceLogicalDeviceId, expiresAt: next.expiresAt });
    if (scope.origin !== originalRecovery.origin || scope.ownerUserId !== originalRecovery.ownerUserId
      || scope.tenantId !== originalRecovery.tenantId || scope.region !== originalRecovery.region
      || scope.sourceLogicalDeviceId !== originalRecovery.sourceLogicalDeviceId || scope.intentId === originalRecovery.intentId)
      throw networkError();
    const root = next.expectedRoot;
    if (!binary(root.deviceInstanceId, 16) || !binary(root.controllerId, 16) || !binary(root.adminFingerprint, 32)
      || !u32(root.accessEpoch) || !u32(root.credentialVersion)) throw networkError();
    return { originalRecovery, operation: { contract: next.contract, operationId: next.operationId,
      sourceLogicalDeviceId: next.sourceLogicalDeviceId, targetLogicalDeviceId: next.targetLogicalDeviceId,
      existingLocator: next.existingLocator, expiresAt: next.expiresAt,
      expectedRoot: { deviceInstanceId: root.deviceInstanceId, accessEpoch: root.accessEpoch, controllerId: root.controllerId,
        credentialVersion: root.credentialVersion, adminFingerprint: root.adminFingerprint },
      origin: scope.origin, region: scope.region, tenantId: scope.tenantId, ownerUserId: scope.ownerUserId,
      cloudCredentialVersion: next.cloudCredentialVersion } };
  } catch { throw networkError(); }
}

function admissionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== admissionKeys.length
      || admissionKeys.some(key => !Object.hasOwn(value, key))) throw admissionError();
  const { origin, ownerUserId, tenantId, region, intentId, sourceLogicalDeviceId, expiresAt } = value;
  if (typeof origin !== 'string' || origin.length > 512 || !origin.startsWith('https://')) throw admissionError();
  let url;
  try { url = new URL(origin); } catch { throw admissionError(); }
  if (url.origin !== origin || url.port === '0' || !['China', 'Global', 'Development'].includes(region)
      || ![ownerUserId, tenantId, sourceLogicalDeviceId].every(id => typeof id === 'string' && id.length > 0
        && Buffer.byteLength(id, 'utf8') <= 128 && id.trim() === id && !/[\u0000-\u001f\u007f/]/u.test(id))
      || typeof intentId !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(intentId)
      || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw admissionError();
  const intent = Buffer.from(intentId, 'base64url');
  if (intent.length !== 16 || !intent.some(Boolean) || intent.toString('base64url') !== intentId) throw admissionError();
  return { origin, ownerUserId, tenantId, region, intentId, sourceLogicalDeviceId, expiresAt };
}

function readAdmissionFile(file, maxBytes, error) {
  if (typeof file !== 'string' || !isAbsolute(file)) throw error();
  let descriptor;
  try {
    const entry = lstatSync(file);
    if (!entry.isFile() || entry.size < 1 || entry.size > maxBytes) throw error();
    descriptor = openSync(file, 'r');
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== entry.dev || opened.ino !== entry.ino) throw error();
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < bytes.length) {
      const read = readSync(descriptor, bytes, used, bytes.length - used, null);
      if (read === 0) break;
      used += read;
    }
    if (used > maxBytes) throw error();
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used)));
  } catch { throw error(); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

export function readBc5Admission(file) {
  return admissionMetadata(readAdmissionFile(file, maxAdmissionBytes, admissionError));
}
export function readInitialNetworkAdmission(file) {
  return initialNetworkMetadata(readAdmissionFile(file, 4096, networkError));
}

export function cloudBetaEnvironment(env) {
  if ((env.BLINKER_APP_PROFILE && env.BLINKER_APP_PROFILE !== 'cloud-beta') ||
      env.BLINKER_LOCAL_CLEARTEXT === '1' || env.BLINKER_DEBUG_NETWORK_CONFIG_DIR) {
    throw new Error('Cloud beta forbids conflicting profile or local network trust');
  }
  const profile = bc5Profile(env);
  if (profile === 'initialNetworkAdmission') readInitialNetworkAdmission(env.BLINKER_INITIAL_NETWORK_ADMISSION_FILE);
  else if (profile) readBc5Admission(env.BLINKER_BC5_ADMISSION_FILE);
  else if (env.BLINKER_BC5_ADMISSION_FILE !== undefined) throw admissionError();
  if (profile === 'initialNetworkAdmission' && env.BLINKER_BC5_ADMISSION_FILE !== undefined) throw admissionError();
  if (profile !== 'initialNetworkAdmission' && env.BLINKER_INITIAL_NETWORK_ADMISSION_FILE !== undefined) throw networkError();
  return { ...env, BLINKER_APP_PROFILE: 'cloud-beta' };
}

export function bc5Profile(env) {
  for (const flag of ['BLINKER_BC5_CANDIDATE', 'BLINKER_BC5_RECOVERY', 'BLINKER_INITIAL_NETWORK_RECOVERY']) {
    if (env[flag] !== undefined && !['0', '1'].includes(env[flag])) throw new Error(`${flag} must be 0 or 1`);
  }
  const candidate = env.BLINKER_BC5_CANDIDATE === '1', recovery = env.BLINKER_BC5_RECOVERY === '1';
  const network = env.BLINKER_INITIAL_NETWORK_RECOVERY === '1';
  if ([candidate, recovery, network].filter(Boolean).length > 1) throw new Error('Private access profiles are mutually exclusive');
  const sealed = env.BLINKER_WIFIPROV_SEALED_FIRST_INSTALL;
  if ((sealed !== undefined && !['0', '1'].includes(sealed)) || (sealed === '1' && (candidate || recovery || network))) {
    throw new Error('Invalid sealed first installation candidate selection');
  }
  return candidate ? 'admission' : recovery ? 'recoveryAdmission' : network ? 'initialNetworkAdmission' : undefined;
}

export function verifyNativeInputs(config, plugins, profile, expectedAdmission, sealed = false) {
  if (profile !== undefined && (!['admission', 'recoveryAdmission', 'initialNetworkAdmission'].includes(profile) || sealed)) throw admissionError();
  if (config.appId !== 'iot.diandeng.tech.beta' || config.loggingBehavior !== 'none' ||
      config.server?.androidScheme !== 'https' || config.server?.cleartext !== false ||
      Object.hasOwn(config.server, 'url') || !Array.isArray(plugins) ||
      !plugins.some(p => p.pkg === '@aparajita/capacitor-secure-storage' && p.classpath)) {
    throw new Error('Incomplete cloud beta native config or plugin registry');
  }
  const candidate = profile === 'admission' || profile === 'initialNetworkAdmission';
  const flag = config.plugins?.WiFiProv?.initialCloudWifiCandidate;
  if ((flag !== undefined && typeof flag !== 'boolean') || (flag === true) !== candidate
      || (candidate && !plugins.some(p => p.pkg === 'capacitor-wifiprov' && p.classpath === 'com.wifiprov.capacitor.WiFiProvPlugin'))) {
    throw new Error('BC-5 candidate configuration or WiFiProv registration does not match the explicit build request');
  }
  const checkpoint = config.plugins?.BlinkerBc5Checkpoint;
  if (profile) {
    const metadata = profile === 'initialNetworkAdmission' ? initialNetworkMetadata : admissionMetadata;
    if (!checkpoint || Object.keys(checkpoint).length !== 1 || !Object.hasOwn(checkpoint, profile)
        || JSON.stringify(metadata(checkpoint[profile])) !== JSON.stringify(metadata(expectedAdmission)))
      throw admissionError();
  } else if (checkpoint !== undefined) throw admissionError();
  const installation = config.plugins?.BlinkerWiFiProvAllocation;
  if (sealed ? (!installation || Object.keys(installation).length !== 1 || installation.enabled !== true) : installation !== undefined) {
    throw new Error('Sealed first installation native configuration does not match the explicit build request');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const env = cloudBetaEnvironment(process.env);
  const profile = bc5Profile(env);
  const admission = profile === 'initialNetworkAdmission' ? readInitialNetworkAdmission(env.BLINKER_INITIAL_NETWORK_ADMISSION_FILE)
    : profile ? readBc5Admission(env.BLINKER_BC5_ADMISSION_FILE) : undefined;
  const result = spawnSync(process.execPath,
    [resolve(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'],
    { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const assets = resolve(root, 'android/app/src/main/assets');
  verifyNativeInputs(
    JSON.parse(readFileSync(resolve(assets, 'capacitor.config.json'), 'utf8')),
    JSON.parse(readFileSync(resolve(assets, 'capacitor.plugins.json'), 'utf8')),
    profile, admission, env.BLINKER_WIFIPROV_SEALED_FIRST_INSTALL === '1',
  );
}
