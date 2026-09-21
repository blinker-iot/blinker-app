import { BleClient, ScanMode, type ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { ScanCoordinator, type ScanPort } from './scan-coordinator';

interface NativeEvent {
  id: string;
  error?: string;
  retryAfterMs?: number;
  result?: Omit<ScanResult, 'serviceData' | 'manufacturerData' | 'rawAdvertisement'> & {
    serviceData?: Record<string, string>; manufacturerData?: Record<string, string>; rawAdvertisement?: string;
  };
}
const native = registerPlugin<{
  start(options: { id: string; services: readonly string[] }): Promise<void>;
  stop(options: { id: string }): Promise<void>;
  addListener(name: 'scan', callback: (event: NativeEvent) => void): Promise<PluginListenerHandle>;
}>('BlinkerBleScan');

const bytes = (values?: Record<string, string>): Record<string, DataView> => Object.fromEntries(
  Object.entries(values ?? {}).map(([key, value]) => {
    if (!/^(?:[a-f0-9]{2}){0,512}$/.test(value)) throw Error('BLE_SCAN_RESULT_INVALID');
    return [key, new DataView(Uint8Array.from(value.match(/../g) ?? [], byte => parseInt(byte, 16)).buffer)];
  }),
);
let listener: PluginListenerHandle | undefined;
const port: ScanPort<ScanResult> = {
  async start(id, services, result, failed) {
    if (Capacitor.getPlatform() !== 'android') {
      await BleClient.requestLEScan({ services: [...services], allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY }, result);
      return;
    }
    listener = await native.addListener('scan', event => {
      if (event.id !== id) return;
      if (event.error) {
        const error = Error(/^BLE_SCAN_[A-Z_]+$/.test(event.error) ? event.error : 'BLE_SCAN_FAILED');
        if (event.retryAfterMs) Object.assign(error, { retryAfterMs: event.retryAfterMs });
        failed(error);
      } else if (event.result) {
        try { result({ ...event.result, serviceData: bytes(event.result.serviceData), manufacturerData: bytes(event.result.manufacturerData),
          rawAdvertisement: event.result.rawAdvertisement === undefined ? undefined : bytes({ raw: event.result.rawAdvertisement })['raw'] }); }
        catch { failed(Error('BLE_SCAN_RESULT_INVALID')); }
      }
    });
    await native.start({ id, services });
  },
  async stop(id) {
    if (Capacitor.getPlatform() !== 'android') { await BleClient.stopLEScan(); return; }
    try { await native.stop({ id }); }
    finally { await listener?.remove(); listener = undefined; }
  },
};

export const bleScanner = new ScanCoordinator(port);
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') bleScanner.cancel();
});
