import { of } from 'rxjs';

import { API, isGatewayUrl } from '../../configs/api.config';
import { DeviceV2SharingService } from './device-v2-sharing.service';

const deviceId = 'device one';
const grant = {
  shareId: 'share-one',
  role: 'operator' as const,
  commandEndpointKeys: ['power'],
  version: 1,
  state: 'active' as const,
  createdAt: 1000,
  updatedAt: 1000,
  revokedAt: null,
};

describe('DeviceV2SharingService', () => {
  it('uses only authenticated V2 invitation and access-grant resources', async () => {
    const get = vi.fn((url: string) => of(
      url === API.DEVICE_V2.RECEIVED_SHARES
        ? { status: 200, data: { devices: [{
          logicalDeviceId: deviceId,
          name: 'Shared lamp',
          deviceType: 'diy',
          share: grant,
        }] } }
        : { status: 200, data: {
          logicalDeviceId: deviceId,
          shares: [{ ...grant, memberRef: 'member-one' }],
          invitations: [],
        } },
    ));
    const post = vi.fn((url: string) => of(
      url === API.DEVICE_V2.ACCEPT_SHARE
        ? { status: 200, data: {
          logicalDeviceId: deviceId,
          share: grant,
          replayed: false,
          realtimeRefreshPending: false,
        } }
        : { status: 201, data: {
          invitationId: 'invitation-one',
          invitationCode: 'A'.repeat(43),
          role: 'operator',
          commandEndpointKeys: null,
          state: 'pending',
          expiresAt: 2000,
          replayed: false,
        } },
    ));
    const http = { get, post } as any;
    const service = new DeviceV2SharingService(http);

    await expect(service.listDevice(deviceId)).resolves.toMatchObject({
      logicalDeviceId: deviceId,
      shares: [{ memberRef: 'member-one' }],
    });
    await expect(service.listReceived()).resolves.toMatchObject([{
      logicalDeviceId: deviceId,
      share: { role: 'operator' },
    }]);
    await expect(service.createInvitation(
      deviceId,
      'operator',
      'share-operation-one',
    )).resolves.toMatchObject({ invitationCode: 'A'.repeat(43) });
    await expect(service.acceptInvitation('A'.repeat(43)))
      .resolves.toMatchObject({ shareId: 'share-one' });

    const urls = [
      API.DEVICE_V2.SHARES(deviceId),
      API.DEVICE_V2.RECEIVED_SHARES,
      API.DEVICE_V2.SHARE_INVITATIONS(deviceId),
      API.DEVICE_V2.ACCEPT_SHARE,
      API.DEVICE_V2.SHARE_INVITATION(deviceId, 'invitation-one'),
      API.DEVICE_V2.SHARE(deviceId, 'share-one'),
      API.DEVICE_V2.RECEIVED_SHARE(deviceId),
    ];
    expect(urls.every(isGatewayUrl)).toBe(true);
  });

  it('sends role changes, owner revocation, and recipient leave to distinct routes', async () => {
    const mutation = (version: number) => ({ status: 200, data: {
      logicalDeviceId: deviceId,
      share: {
        ...grant,
        version,
        role: version === 2 ? 'viewer' : 'operator',
        commandEndpointKeys: version === 2 ? null : ['power'],
        state: version >= 3 ? 'revoked' : 'active',
        updatedAt: 1000 + version,
        revokedAt: version >= 3 ? 1000 + version : null,
      },
      replayed: false,
      realtimeRefreshPending: false,
    } });
    const patch = vi.fn(() => of(mutation(2)));
    const remove = vi.fn((url: string) => of(
      url === API.DEVICE_V2.SHARE(deviceId, grant.shareId)
        ? mutation(3)
        : { status: 200, data: {} },
    ));
    const service = new DeviceV2SharingService({ patch, delete: remove } as any);

    await expect(service.updateShare(deviceId, grant.shareId, 'viewer'))
      .resolves.toMatchObject({ role: 'viewer', version: 2 });
    await expect(service.revokeShare(deviceId, grant.shareId))
      .resolves.toMatchObject({ state: 'revoked', version: 3 });
    await expect(service.leaveShare(deviceId)).resolves.toBeUndefined();

    expect(patch).toHaveBeenCalledWith(
      API.DEVICE_V2.SHARE(deviceId, grant.shareId),
      { role: 'viewer' },
    );
    expect(remove).toHaveBeenCalledWith(API.DEVICE_V2.RECEIVED_SHARE(deviceId));
  });

  it('rejects malformed invitation codes before an HTTP request', async () => {
    const post = vi.fn();
    const service = new DeviceV2SharingService({ post } as any);
    await expect(service.acceptInvitation('short')).rejects.toThrow(/邀请码/);
    expect(post).not.toHaveBeenCalled();
  });
});
