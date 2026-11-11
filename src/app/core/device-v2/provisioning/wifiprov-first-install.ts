import type { PlatformCapabilities, ProvisioningDevice, ProvisionOptions, WiFiProvPlugin } from 'capacitor-wifiprov';
import { sameBytes } from '../ble-direct/wire';
import { decodeWiFiProvBase64 } from './capacitor-esp32-wifiprov.transport';
import {
  BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigBootstrap, type Esp32ProvisioningTransport,
} from './esp32-wifiprov';
import { readSystemConnectedConfigInfoPacket, supportsSystemConnectedConfigInfo } from './wifiprov-config-info-read';
import { isolatedWiFiProvOwner } from './wifiprov-softap-stages';
import { readWiFiProvPoP } from './wifiprov-pop';
import {
  assertWiFiProvResponseOwner as assertOwner, copyWiFiProvWifiOptions as copyWifi, exactWiFiProvKeys as exactKeys,
} from './wifiprov-owned-options';

type FirstInstallClient = Pick<WiFiProvPlugin, 'readBlinkerConfigInfo' | 'bootstrapBlinkerAccess' | 'provisionBlinkerWifi'>;
const coded = (code: string) => Object.assign(Error(code), { code });
const unknown = () => coded('PROVISIONING_RESULT_UNKNOWN');
const invalid = () => coded('WIFIPROV_REQUEST_INVALID');

export function supportsFirstInstall(capabilities?: PlatformCapabilities): boolean {
  return supportsSystemConnectedConfigInfo(capabilities) && capabilities?.softApSystemConnectedFirstInstall === true;
}

/** Explicit caller-supplied PoP only. Never derive it from public identifiers. */
export function assertFirstInstallPoP(value: unknown): string {
  try { return readWiFiProvPoP(value, true)!; }
  catch { throw coded('WIFIPROV_FIRST_INSTALL_POP_REQUIRED'); }
}

/** Thin, single-owner transport policy; the existing coordinator owns Cloud/CAS/journals. */
export class WiFiProvFirstInstallPort implements Esp32ProvisioningTransport {
  private readonly owner: ReturnType<typeof isolatedWiFiProvOwner>;
  private readonly device: ProvisioningDevice;
  private readonly capabilities: PlatformCapabilities;
  private busy = false;
  private retired = false;
  private instanceHex?: string;
  private bootstrapAttempted = false;
  private bootstrapAcknowledged = false;
  private wifiAttempted = false;

  /** Historical facts only; neither getter authorizes another call or releases an owner. */
  get confirmedBootstrap(): boolean { return this.bootstrapAcknowledged; }
  get submittedWiFi(): boolean { return this.wifiAttempted; }

  constructor(
    private readonly client: FirstInstallClient,
    capabilities: PlatformCapabilities | undefined,
    connected: ProvisioningDevice,
    private readonly assertCurrent: () => void,
  ) {
    assertCurrent();
    if (!supportsFirstInstall(capabilities) || typeof client.readBlinkerConfigInfo !== 'function'
      || typeof client.bootstrapBlinkerAccess !== 'function' || typeof client.provisionBlinkerWifi !== 'function') {
      throw coded('WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED');
    }
    this.owner = isolatedWiFiProvOwner(connected);
    if (connected.connected !== true) throw coded('WIFIPROV_NOT_CONNECTED');
    this.device = { name: connected.name, capabilities: [], transport: 'softap', security: 1, connected: true, localOwner: this.owner };
    this.capabilities = { ...capabilities! };
  }

  async request(endpoint: string, payload: Uint8Array): Promise<Uint8Array> {
    // Bounded copy precedes the first await; caller zeroization cannot change a send.
    const bytes = payload instanceof Uint8Array && [2, 101].includes(payload.length) ? payload.slice() : undefined;
    try {
      return await this.run(async invoked => {
        if (endpoint !== BLINKER_CONFIG_ENDPOINT || !bytes || bytes[0] !== 2) throw invalid();
        if (bytes.length === 2 && bytes[1] === 1) {
          invoked();
          const packet = await readSystemConnectedConfigInfoPacket(this.client, this.capabilities, this.device, () => this.check());
          this.check();
          if (!packet.info) { this.retire(); return packet.bytes; }
          const info = packet.info;
          if (info.hasDeviceKey || info.hasAccessState || !info.supportsAccessBootstrap || info.accessEpoch !== 0) throw unknown();
          const instance = Array.from(info.deviceInstanceId, byte => byte.toString(16).padStart(2, '0')).join('');
          if (this.instanceHex !== undefined && this.instanceHex !== instance) throw unknown();
          // Reading cannot reset either consumed attempt or manufacture an ACK.
          if (!this.bootstrapAttempted) this.instanceHex = instance;
          return packet.bytes;
        }
        if (!this.instanceHex || this.bootstrapAttempted || bytes.length !== 101 || bytes[1] !== 3) throw invalid();
        const base64 = bootstrapBase64(bytes);
        const options = { deviceInstanceIdHex: this.instanceHex, base64 };
        this.bootstrapAttempted = true;
        invoked();
        const response = await this.client.bootstrapBlinkerAccess(options);
        this.check();
        const body = ownedBase64(response, this.owner.session);
        if (body.length !== 3 || body[0] !== 2 || body[1] !== 3 || body[2] > 8) throw unknown();
        this.check();
        if (body[2] === 0) this.bootstrapAcknowledged = true;
        else this.retire();
        return body;
      });
    } finally { bytes?.fill(0); }
  }

  async provision(options: ProvisionOptions): Promise<{ success: true }> {
    let snapshot: ProvisionOptions | undefined;
    try { snapshot = copyWifi(options); } catch { /* The serialized run owns failure/retirement. */ }
    return this.run(async invoked => {
      if (!snapshot) throw invalid();
      if (!this.bootstrapAcknowledged || this.wifiAttempted) throw invalid();
      this.wifiAttempted = true;
      invoked();
      const response = await this.client.provisionBlinkerWifi(snapshot);
      this.check();
      if (!exactKeys(response, ['success', 'localOwner']) || response.success !== true) throw unknown();
      assertOwner(response.localOwner, this.owner.session);
      this.check();
      return { success: true as const };
    });
  }

  /** Revokes this port synchronously; actual native close/death stays with the Page. */
  retire(): void { this.retired = true; this.instanceHex = undefined; }

  private check(): void {
    if (this.retired) throw coded('WIFIPROV_SCOPE_QUARANTINED');
    try { this.assertCurrent(); }
    catch (error) { this.retire(); throw error; }
    if (this.retired) throw coded('WIFIPROV_SCOPE_QUARANTINED');
  }

  private async run<T>(work: (invoked: () => void) => Promise<T>): Promise<T> {
    this.check();
    if (this.busy) throw coded('WIFIPROV_OPERATION_BUSY');
    this.busy = true;
    let invoked = false;
    try { return await work(() => { this.check(); invoked = true; }); }
    catch (error) {
      const late = this.retired;
      this.retire();
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'PROVISIONING_RESULT_UNKNOWN') throw error;
      if (invoked && (late || code === 'WIFIPROV_OPERATION_CANCELLED' || code === 'WIFIPROV_SCOPE_QUARANTINED'
        || code === 'WIFIPROV_CLOSE_UNCONFIRMED' || (error as { name?: unknown } | null)?.name === 'AbortError')) throw unknown();
      throw error;
    } finally { this.busy = false; }
  }
}

function bootstrapBase64(bytes: Uint8Array): string {
  let encoded: Uint8Array | undefined;
  const controllerId = bytes.slice(49, 65), controllerSecret = bytes.slice(69, 101);
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length !== 101 || bytes[0] !== 2 || bytes[1] !== 3 || view.getUint32(45, false) !== 1
      || view.getUint32(65, false) !== 1) throw invalid();
    encoded = encodeBlinkerConfigBootstrap(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(2, 45)),
      { accessEpoch: 1, credentialVersion: 1, controllerId, controllerSecret });
    if (!sameBytes(encoded, bytes)) throw invalid();
    return btoa(Array.from(encoded, byte => String.fromCharCode(byte)).join(''));
  } catch { throw invalid(); }
  finally { encoded?.fill(0); controllerId.fill(0); controllerSecret.fill(0); }
}

function ownedBase64(value: unknown, owner: string): Uint8Array {
  try {
    if (!exactKeys(value, ['base64', 'localOwner']) || typeof value['base64'] !== 'string' || value['base64'].length !== 4) throw unknown();
    assertOwner(value['localOwner'], owner);
    return decodeWiFiProvBase64(value['base64']);
  } catch { throw unknown(); }
}
