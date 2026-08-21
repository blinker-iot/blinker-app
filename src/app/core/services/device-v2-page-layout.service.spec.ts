import { of, throwError } from 'rxjs';

import { API, isGatewayUrl } from '../../configs/api.config';
import { DeviceUiEndpoint } from '../device-v2/device-ui.port';
import { GatewayHttpError } from '../model/response.model';
import { DeviceV2PageLayoutService } from './device-v2-page-layout.service';

const logicalDeviceId = 'device_v2_layout';
const fingerprint = 'ab'.repeat(32);
const endpoints: DeviceUiEndpoint[] = [{
  id: 1,
  key: 'power',
  role: 'property',
  valueType: 'boolean',
  readable: true,
  writable: true,
  notifies: true,
}];
const layout = {
  schemaVersion: 1 as const,
  revision: 1,
  manifestFingerprint: fingerprint,
  columns: 8 as const,
  widgets: [{
    widgetId: 'power',
    type: 'switch' as const,
    endpointKey: 'power',
    grid: { x: 0, y: 0, width: 8, height: 1 },
  }],
};

describe('DeviceV2PageLayoutService', () => {
  it('uses one authenticated Gateway resource and sends optimistic revision metadata', async () => {
    const put = vi.fn(() => of({
      status: 201,
      body: {
        status: 201,
        data: {
          logicalDeviceId,
          revision: 1,
          manifestFingerprint: fingerprint,
          layout,
          createdAt: 1000,
          updatedAt: 1000,
        },
      },
    }));
    const service = new DeviceV2PageLayoutService({ put } as any);

    await expect(service.saveCandidate(logicalDeviceId, layout, endpoints, 0))
      .resolves.toEqual(expect.objectContaining({ revision: 1, layout }));
    expect(put).toHaveBeenCalledWith(
      API.DEVICE_V2.PAGE_LAYOUT(logicalDeviceId),
      { expectedRevision: 0, layout },
      { observe: 'response' },
    );
    expect(isGatewayUrl(API.DEVICE_V2.PAGE_LAYOUT(logicalDeviceId))).toBe(true);
  });

  it('maps only the explicit not-found contract to an absent layout', async () => {
    const missing = new DeviceV2PageLayoutService({
      get: () => throwError(() => new GatewayHttpError({
        httpStatus: 404,
        code: 'DEVICE_V2_PAGE_LAYOUT_NOT_FOUND',
        message: 'missing',
      })),
    } as any);
    await expect(missing.get(logicalDeviceId)).resolves.toBeNull();

    const unavailable = new DeviceV2PageLayoutService({
      get: () => throwError(() => new GatewayHttpError({
        httpStatus: 503,
        code: 'DEVICE_V2_PAGE_LAYOUT_UNAVAILABLE',
        message: 'unavailable',
      })),
    } as any);
    await expect(unavailable.get(logicalDeviceId)).rejects.toMatchObject({
      code: 'DEVICE_V2_PAGE_LAYOUT_UNAVAILABLE',
    });
  });

  it('rejects a candidate whose base revision or endpoint binding is invalid', async () => {
    const service = new DeviceV2PageLayoutService({ put: vi.fn() } as any);
    await expect(service.saveCandidate(
      logicalDeviceId,
      { ...layout, revision: 3 },
      endpoints,
      1,
    )).rejects.toThrow(/base revision/);
    await expect(service.saveCandidate(
      logicalDeviceId,
      { ...layout, widgets: [{ ...layout.widgets[0], endpointKey: 'missing' }] },
      endpoints,
      1,
    )).rejects.toThrow(/incompatible/);
  });
});
