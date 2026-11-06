import type { PlatformCapabilities, ProvisioningDevice, ProvisionOptions, WiFiProvPlugin } from 'capacitor-wifiprov';
import { BLINKER_CONFIG_ENDPOINT, type Esp32ProvisioningTransport } from './esp32-wifiprov';
import { readSystemConnectedConfigInfoPacket, supportsSystemConnectedConfigInfo } from './wifiprov-config-info-read';
import { assertWiFiProvResponseOwner, copyWiFiProvWifiOptions, exactWiFiProvKeys } from './wifiprov-owned-options';
import { isolatedWiFiProvOwner } from './wifiprov-softap-stages';
import { readWiFiProvPoP } from './wifiprov-pop';

type WifiReconfigureClient = Pick<WiFiProvPlugin, 'readBlinkerConfigInfo' | 'provisionBlinkerWifiOnly'>;
const coded = (code: string) => Object.assign(Error(code), { code });
const unknown = () => coded('PROVISIONING_RESULT_UNKNOWN');

export function supportsWifiReconfigure(capabilities?: PlatformCapabilities): boolean {
  return supportsSystemConnectedConfigInfo(capabilities) && capabilities?.softApSystemConnectedWifiReconfigure === true;
}

/** Firmware-supplied PoP, not a DeviceKey/SSID-derived credential. Native verifies actual Security1 again. */
export function assertWifiReconfigurePoP(value: unknown): string {
  try { return readWiFiProvPoP(value, true)!; }
  catch { throw coded('WIFIPROV_WIFI_RECONFIGURE_POP_REQUIRED'); }
}

/** Network-only policy for an explicit fresh native owner. Cloud/Admin/CAS stay in the existing coordinator. */
export class WiFiProvWifiReconfigurePort implements Esp32ProvisioningTransport {
  private readonly owner: ReturnType<typeof isolatedWiFiProvOwner>;
  private readonly device: ProvisioningDevice;
  private readonly capabilities: PlatformCapabilities;
  private root?: { deviceInstanceIdHex: string; accessEpoch: number };
  private busy = false;
  private retired = false;
  private wifiAttempted = false;

  /** Historical submission fact only; never a retry or owner-release permission. */
  get submittedWiFi(): boolean { return this.wifiAttempted; }

  constructor(
    private readonly client: WifiReconfigureClient,
    capabilities: PlatformCapabilities | undefined,
    connected: ProvisioningDevice,
    private readonly assertCurrent: () => void,
  ) {
    assertCurrent();
    if (!supportsWifiReconfigure(capabilities) || typeof client.readBlinkerConfigInfo !== 'function'
      || typeof client.provisionBlinkerWifiOnly !== 'function') throw coded('WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED');
    this.owner = isolatedWiFiProvOwner(connected);
    if (connected.connected !== true) throw coded('WIFIPROV_NOT_CONNECTED');
    this.device = { name: connected.name, capabilities: [], transport: 'softap', security: 1, connected: true, localOwner: this.owner };
    this.capabilities = { ...capabilities! };
  }

  async request(endpoint: string, payload: Uint8Array): Promise<Uint8Array> {
    const fixedInfo = endpoint === BLINKER_CONFIG_ENDPOINT && payload instanceof Uint8Array
      && payload.length === 2 && payload[0] === 2 && payload[1] === 1;
    return this.run(async invoked => {
      if (!fixedInfo) throw coded('WIFIPROV_REQUEST_INVALID');
      invoked();
      const packet = await readSystemConnectedConfigInfoPacket(this.client, this.capabilities, this.device, () => this.check());
      this.check();
      if (!packet.info) { this.retire(); return packet.bytes; }
      const info = packet.info;
      if (!info.hasDeviceKey || !info.hasAccessState || !info.supportsAccessBootstrap
        || !Number.isInteger(info.accessEpoch) || info.accessEpoch < 1 || info.accessEpoch > 0xffffffff) throw unknown();
      const root = { deviceInstanceIdHex: Array.from(info.deviceInstanceId, byte => byte.toString(16).padStart(2, '0')).join(''),
        accessEpoch: info.accessEpoch };
      if (this.root && (this.root.deviceInstanceIdHex !== root.deviceInstanceIdHex || this.root.accessEpoch !== root.accessEpoch)) throw unknown();
      this.root = root; // A consistent fresh read never resets the one consumed WiFi attempt.
      return packet.bytes;
    });
  }

  async provision(options: ProvisionOptions, signal?: AbortSignal): Promise<{ success: true }> {
    let snapshot: ProvisionOptions | undefined;
    try { snapshot = copyWiFiProvWifiOptions(options); } catch { /* Serialized run owns retirement. */ }
    return this.run(async invoked => {
      if (!snapshot || !this.root || this.wifiAttempted) throw coded('WIFIPROV_REQUEST_INVALID');
      const request = { ...snapshot, ...this.root };
      this.wifiAttempted = true;
      invoked();
      const response = await this.client.provisionBlinkerWifiOnly(request);
      this.check();
      if (!exactWiFiProvKeys(response, ['success', 'localOwner']) || response.success !== true) throw unknown();
      assertWiFiProvResponseOwner(response.localOwner, this.owner.session);
      this.check();
      return { success: true as const };
    }, signal);
  }

  /** Synchronous revocation only. The existing Page remains responsible for actual native close/death. */
  retire(): void { this.retired = true; this.root = undefined; }

  private check(): void {
    if (this.retired) throw coded('WIFIPROV_SCOPE_QUARANTINED');
    try { this.assertCurrent(); } catch (error) { this.retire(); throw error; }
    if (this.retired) throw coded('WIFIPROV_SCOPE_QUARANTINED');
  }

  private async run<T>(work: (invoked: () => void) => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.check();
    if (this.busy) throw coded('WIFIPROV_OPERATION_BUSY');
    this.busy = true;
    let invoked = false, abort!: () => void;
    try {
      if (signal?.aborted) throw coded('WIFIPROV_OPERATION_CANCELLED');
      const cancelled = new Promise<never>((_resolve, reject) => {
        abort = () => { this.retire(); reject(coded('WIFIPROV_OPERATION_CANCELLED')); };
        signal?.addEventListener('abort', abort, { once: true });
      });
      // Both branches stay observed even after cancellation; no late native result can be delivered or retried.
      return await Promise.race([work(() => { this.check(); invoked = true; }), cancelled]);
    } catch (error) {
      const late = this.retired;
      this.retire();
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'PROVISIONING_RESULT_UNKNOWN') throw error;
      if (invoked && (late || code === 'WIFIPROV_OPERATION_CANCELLED' || code === 'WIFIPROV_SCOPE_QUARANTINED'
        || code === 'WIFIPROV_CLOSE_UNCONFIRMED' || (error as { name?: unknown } | null)?.name === 'AbortError')) throw unknown();
      throw error;
    } finally { signal?.removeEventListener('abort', abort); this.busy = false; }
  }
}
