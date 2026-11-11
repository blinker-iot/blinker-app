import type { WiFiProvTransport } from 'capacitor-wifiprov';
import type { DeviceV2ManagementService } from '../../services/device-v2-management.service';
import type { KnownCredentialRootContext } from '../ble-direct/credential-root-lifecycle';
import { base64UrlDecode } from '../ble-direct/wire';
import { allocationContext } from './wifiprov-allocation';

export type WiFiProvManagement = Pick<DeviceV2ManagementService,
  'createDeviceKeyV2' | 'revealDeviceKeyV2' | 'rotateDeviceKeyV2' | 'resolveDeviceInstanceV2'
  | 'getDirectAdminV2' | 'registerDirectAdminV2' | 'resetDirectAdminV2'
  | 'deleteDeviceV2' | 'readDeviceStateV2'>;

export function assertWiFiProvCloudTransport(transport: WiFiProvTransport | undefined): void {
  if (transport === 'softap') {
    throw Object.assign(Error('本次原生进程的 SoftAP 网络退出尚未确认，已停止配网云端操作；恢复互联网或重新进入页面不会解除隔离，不会自动重试。'),
      { code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
  }
  if (transport !== 'ble') {
    throw Object.assign(Error('无法确认配网方式，已停止云端身份操作；请重新选择设备。'),
      { code: 'WIFIPROV_TRANSPORT_REQUIRED' });
  }
}

// Transport is a transaction snapshot, not a mutable page selection. This gate
// never changes networks, retries a request, or alters an identity checkpoint.
export function protectedWiFiProvManagement(
  source: WiFiProvManagement, transport: WiFiProvTransport | undefined, assertCurrent: () => void,
  assertNetwork: () => Promise<void>,
  cloudWork?: <T>(work: () => Promise<T>) => Promise<T>,
  rootChanged?: (logicalDeviceId: string, expected: KnownCredentialRootContext) => Promise<void>,
): WiFiProvManagement {
  const selectedTransport = transport;
  const protect = <Args extends unknown[], Result>(method: (...args: Args) => Promise<Result>) =>
    async (...args: Args): Promise<Result> => {
      assertCurrent();
      if (selectedTransport !== 'softap' || !cloudWork) assertWiFiProvCloudTransport(selectedTransport);
      const invoke = async () => {
        await assertNetwork();
        assertCurrent();
        const value = await method.apply(source, args);
        assertCurrent();
        return value;
      };
      // Only the captured, validated stage owner may run a SoftAP Cloud step.
      // A transport selection, boolean capability or ready snapshot cannot supply it.
      return selectedTransport === 'softap' ? cloudWork!(invoke) : invoke();
    };

  return {
    createDeviceKeyV2: protect(source.createDeviceKeyV2),
    revealDeviceKeyV2: protect(source.revealDeviceKeyV2),
    rotateDeviceKeyV2: protect(async (...[context, requestId]: Parameters<WiFiProvManagement['rotateDeviceKeyV2']>) => {
      const result = await source.rotateDeviceKeyV2(context, requestId);
      if (rootChanged && result.status === 200 && result.data.logicalDeviceId === context.logicalDeviceId
        && result.data.credentialVersion === context.credentialVersion + 1 && result.data.locator !== context.locator) {
        assertCurrent();
        // Only an exact new version may invalidate the previous local root.
        allocationContext(result.data);
        await rootChanged(context.logicalDeviceId, { cloudCredentialVersion: context.credentialVersion });
      }
      return result;
    }),
    resolveDeviceInstanceV2: protect(source.resolveDeviceInstanceV2),
    getDirectAdminV2: protect(source.getDirectAdminV2),
    registerDirectAdminV2: protect(source.registerDirectAdminV2),
    resetDirectAdminV2: protect(async (...[id, input]: Parameters<WiFiProvManagement['resetDirectAdminV2']>) => {
      const result = await source.resetDirectAdminV2(id, input);
      if (rootChanged && result.logicalDeviceId === id && result.accessEpoch === input.expectedAccessEpoch + 1
        && result.controllerId === input.controllerId && result.credentialVersion === 1) {
        assertCurrent();
        await rootChanged(id, { accessEpoch: input.expectedAccessEpoch,
          controllerId: base64UrlDecode(input.expectedControllerId, 16) });
      }
      return result;
    }),
    deleteDeviceV2: protect(source.deleteDeviceV2),
    readDeviceStateV2: protect(source.readDeviceStateV2),
  };
}
