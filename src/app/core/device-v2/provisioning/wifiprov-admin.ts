import { DeviceKeyContext } from '../../model/response.model';
import type { DeviceV2ManagementService } from '../../services/device-v2-management.service';
import {
  BleControllerCredential, BleControllerCredentialStore, clearBleControllerCredentialSecrets,
} from '../ble-direct/credential-store';
import { BleDirectCrypto } from '../ble-direct/crypto';
import { base64UrlDecode, base64UrlEncode, sameBytes } from '../ble-direct/wire';
import {
  BLINKER_CONFIG_ENDPOINT, BlinkerConfigInfo, BlinkerConfigOperation, Esp32ProvisioningTransport,
  decodeBlinkerConfigInfo, decodeBlinkerConfigStatus, encodeBlinkerConfigBootstrap, encodeBlinkerConfigInfoRequest,
} from './esp32-wifiprov';

interface CredentialStore extends Pick<BleControllerCredentialStore, 'save' | 'load'> {
  findWiFiProv(instance: Uint8Array, pendingOnly?: boolean): Promise<BleControllerCredential | undefined>;
}
type Management = Pick<DeviceV2ManagementService,
  'getDirectAdminV2' | 'registerDirectAdminV2' | 'resetDirectAdminV2' | 'rotateDeviceKeyV2' | 'revealDeviceKeyV2'>;

export interface WiFiProvIdentity extends DeviceKeyContext { accessEpoch: number; }

// Recoverable first install / replacement, independent of page/native transport.
// A saved pending Admin is not a working Direct credential until exact Bootstrap ACK.
export class WiFiProvAdmin {
  constructor(
    private readonly store: CredentialStore,
    private readonly management: Management,
    private readonly transport: Esp32ProvisioningTransport,
    private readonly assertCurrent: () => void,
    private readonly crypto = new BleDirectCrypto(),
  ) {}

  async resume(info: BlinkerConfigInfo, expectedId?: string): Promise<WiFiProvIdentity | undefined> {
    let credential = await this.step(() => expectedId
      ? this.store.load(expectedId) : this.store.findWiFiProv(info.deviceInstanceId, !info.hasAccessState), this.clearCredential);
    if (!credential) return undefined;
    try {
      if (credential.source !== 'wifiprov' || !credential.cloudContext) return undefined;
      if (expectedId && credential.logicalDeviceId !== expectedId) throw new Error('WIFIPROV_CHECKPOINT_DEVICE_MISMATCH');
      this.match(credential, info);
      if (credential.state === 'pending') {
        credential = await this.advanceRotation(credential, info);
        const revealed = await this.reveal(this.identity(credential));
        await this.finish(credential, revealed.deviceKey, info);
      } else {
        // A confirmed physical empty root can start an EXPLICIT new operation
        // below. Never reinstall the old active Admin as pending.
        if (!info.hasDeviceKey && !info.hasAccessState) return undefined;
        if (!info.hasDeviceKey || !info.hasAccessState) {
          throw new Error('设备接入根已重置；不能用旧检查点恢复已清除的 Admin');
        }
        await this.reveal(this.identity(credential));
        await this.registerExisting(credential);
      }
      return this.identity(credential);
    } finally { clearBleControllerCredentialSecrets(credential); }
  }

  async reconfigure(context: DeviceKeyContext, info: BlinkerConfigInfo): Promise<WiFiProvIdentity> {
    this.requireEmpty(info);
    let credential = await this.step(() => this.store.load(context.logicalDeviceId), this.clearCredential);
    try {
      if (credential?.state === 'pending') throw new Error('请先恢复当前设备未完成的配网检查点');
      const expected = await this.step(() => this.management.getDirectAdminV2(context.logicalDeviceId));
      if (expected && (expected.logicalDeviceId !== context.logicalDeviceId || expected.credentialVersion !== 1
        || !Number.isSafeInteger(expected.accessEpoch) || expected.accessEpoch < 1 || expected.accessEpoch >= 0xffffffff
        || !base64UrlDecode(expected.controllerId, 16).some(Boolean))) throw new Error('WIFIPROV_ADMIN_EPOCH_CONFLICT');
      if (credential && (!sameBytes(credential.deviceInstanceId, info.deviceInstanceId)
        || credential.accessEpoch !== expected?.accessEpoch || base64UrlEncode(credential.controllerId) !== expected?.controllerId))
        throw new Error('WIFIPROV_CHECKPOINT_CONFLICT');
      if (credential?.source === 'wifiprov' && !credential.cloudContext)
        throw new Error('旧配网记录缺少云凭据上下文，请先恢复原设备记录');
      // Reject a context already stale before preparing. The exact rotation
      // result and PATCH still fence a concurrent cloud change afterwards.
      await this.reveal(context);
      if (context.credentialVersion >= 0xffffffff) throw new Error('WIFIPROV_KEY_VERSION_EXHAUSTED');
      if (credential) clearBleControllerCredentialSecrets(credential);
      credential = this.candidate(context, info, expected ? expected.accessEpoch + 1 : 1);
      credential.keyRotation = { phase: 'prepared', operationId: base64UrlEncode(this.crypto.random(16)),
        previousContext: { credentialVersion: context.credentialVersion, locator: context.locator },
        expectedAdmin: expected ? { controllerId: expected.controllerId, accessEpoch: expected.accessEpoch } : undefined };
      // Schema 6 fails closed on older readers. One atomic credential write
      // fixes the candidate and rotation identity BEFORE the first mutation.
      await this.step(() => this.store.save(credential!));
      credential = await this.advanceRotation(credential, info);
      const revealed = await this.reveal(this.identity(credential));
      await this.finish(credential, revealed.deviceKey, info);
      return this.identity(credential);
    } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
  }

  async install(context: DeviceKeyContext & { deviceKey: string }, info: BlinkerConfigInfo): Promise<void> {
    let credential = await this.step(() => this.store.load(context.logicalDeviceId), this.clearCredential);
    try {
      if (credential) {
        if (credential.source !== 'wifiprov' || credential.state !== 'pending' || credential.keyRotation
          || credential.cloudContext?.credentialVersion !== context.credentialVersion
          || credential.cloudContext?.locator !== context.locator) throw new Error('WIFIPROV_CHECKPOINT_CONFLICT');
      } else {
        this.requireEmpty(info);
        credential = this.candidate(context, info, 1);
        await this.step(() => this.store.save(credential!));
      }
      await this.finish(credential, context.deviceKey, info);
    } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
  }

  private async registerExisting(credential: BleControllerCredential): Promise<void> {
    const fingerprint = await this.step(() => this.crypto.adminFingerprint(
      credential.controllerId, credential.controllerSecret,
    ), value => value.fill(0));
    try {
      const rotation = credential.keyRotation;
      if (rotation && rotation.phase !== 'key-ready') throw new Error('WIFIPROV_KEY_NOT_READY');
      const record = await this.step(() => rotation?.expectedAdmin
        ? this.management.resetDirectAdminV2(credential.logicalDeviceId, {
          operationId: rotation.operationId, deviceInstanceId: base64UrlEncode(credential.deviceInstanceId),
          expectedAccessEpoch: rotation.expectedAdmin.accessEpoch, expectedControllerId: rotation.expectedAdmin.controllerId,
          cloudCredentialVersion: credential.cloudContext!.credentialVersion, controllerId: base64UrlEncode(credential.controllerId),
          credentialVersion: 1, fingerprint: base64UrlEncode(fingerprint),
        })
        : this.management.registerDirectAdminV2(credential.logicalDeviceId, credential.controllerId, fingerprint));
      if (record.accessEpoch !== credential.accessEpoch) throw new Error('WIFIPROV_ADMIN_EPOCH_CONFLICT');
    } finally { fingerprint.fill(0); }
  }

  private match(credential: BleControllerCredential, info: BlinkerConfigInfo): void {
    if (!sameBytes(credential.deviceInstanceId, info.deviceInstanceId)
      || !info.supportsAccessBootstrap
      || (info.hasAccessState ? info.accessEpoch < 1 : info.accessEpoch !== 0)
      || (info.hasAccessState && info.accessEpoch !== credential.accessEpoch)) {
      throw new Error('WIFIPROV_CHECKPOINT_DEVICE_MISMATCH');
    }
  }

  private async finish(credential: BleControllerCredential, key: string, info: BlinkerConfigInfo): Promise<void> {
    this.match(credential, info);
    await this.registerExisting(credential);
    if (credential.keyRotation) {
      const current = decodeBlinkerConfigInfo(await this.step(() => this.transport.request(
        BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest(),
      )));
      this.match(credential, current);
      if (current.hasDeviceKey !== current.hasAccessState) throw new Error('WIFIPROV_CHECKPOINT_DEVICE_MISMATCH');
    }
    const payload = encodeBlinkerConfigBootstrap(key, credential);
    try {
      // Never fall back to Key-only Install on an ambiguous Bootstrap response.
      decodeBlinkerConfigStatus(await this.step(() => this.transport.request(BLINKER_CONFIG_ENDPOINT, payload)),
        BlinkerConfigOperation.Bootstrap);
      await this.step(() => this.store.save({ ...credential, state: 'active', keyRotation: undefined }));
    } finally { payload.fill(0); }
  }

  private candidate(context: DeviceKeyContext, info: BlinkerConfigInfo, accessEpoch: number): BleControllerCredential {
    return { source: 'wifiprov', state: 'pending', logicalDeviceId: context.logicalDeviceId,
      deviceInstanceId: info.deviceInstanceId.slice(), accessEpoch,
      controllerId: this.crypto.random(16), controllerSecret: this.crypto.random(32), credentialVersion: 1, permissions: 0x0f,
      cloudContext: { credentialVersion: context.credentialVersion, locator: context.locator },
      intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array() };
  }

  private requireEmpty(info: BlinkerConfigInfo): void {
    if (info.hasAccessState || info.hasDeviceKey || info.accessEpoch !== 0 || !info.supportsAccessBootstrap)
      throw new Error('WIFIPROV_BOOTSTRAP_REQUIRES_EMPTY_ROOT');
  }

  private identity(credential: BleControllerCredential): WiFiProvIdentity {
    return { logicalDeviceId: credential.logicalDeviceId, ...credential.cloudContext!, accessEpoch: credential.accessEpoch };
  }

  private async reveal(context: DeviceKeyContext) {
    const response = await this.step(() => this.management.revealDeviceKeyV2({ logicalDeviceId: context.logicalDeviceId,
      credentialVersion: context.credentialVersion, locator: context.locator }));
    if (response.status !== 200) throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    this.matchKey(response.data, context);
    return response.data;
  }

  private matchKey(actual: DeviceKeyContext & { deviceKey: string }, expected: DeviceKeyContext): void {
    if (actual.logicalDeviceId !== expected.logicalDeviceId || actual.credentialVersion !== expected.credentialVersion
      || actual.locator !== expected.locator) throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    const key = base64UrlDecode(actual.deviceKey, 32);
    try {
      if (!key.some(Boolean) || !Number.isSafeInteger(actual.credentialVersion) || actual.credentialVersion < 1
        || actual.credentialVersion > 0xffffffff || !base64UrlDecode(actual.locator, 16).some(Boolean))
        throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    } finally { key.fill(0); }
  }

  private async advanceRotation(credential: BleControllerCredential, info: BlinkerConfigInfo): Promise<BleControllerCredential> {
    const rotation = credential.keyRotation;
    if (rotation?.phase !== 'prepared') return credential;
    this.requireEmpty(info); // No Bootstrap can have happened before key-ready was saved.
    const previous = { logicalDeviceId: credential.logicalDeviceId, ...rotation.previousContext };
    const { data, status } = await this.step(() => this.management.rotateDeviceKeyV2(previous, `wifiprov-${rotation.operationId}`));
    if (status !== 200) throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    this.matchKey(data, { ...previous, credentialVersion: previous.credentialVersion + 1, locator: data.locator });
    if (data.locator === previous.locator) throw new Error('WIFIPROV_KEY_CONTEXT_CHANGED');
    const next: BleControllerCredential = { ...credential,
      cloudContext: { credentialVersion: data.credentialVersion, locator: data.locator },
      keyRotation: { ...rotation, phase: 'key-ready' } };
    await this.step(() => this.store.save(next));
    return next;
  }

  private clearCredential(value: BleControllerCredential | undefined): void {
    if (value) clearBleControllerCredentialSecrets(value);
  }

  private async step<T>(work: () => Promise<T>, discard?: (value: T) => void): Promise<T> {
    this.assertCurrent();
    const value = await work();
    try { this.assertCurrent(); return value; }
    catch (error) { discard?.(value); throw error; }
  }
}
