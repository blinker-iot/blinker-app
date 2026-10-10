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
  it('normalizes directed email and rejects accidental open-code fallback without changing the link API', async () => {
    const data: any = { invitationId: 'A'.repeat(22), role: 'viewer', commandEndpointKeys: null,
      state: 'pending', expiresAt: 2000, replayed: false, targeted: true };
    const post = vi.fn(() => of({ status: 201, data }));
    const service = new DeviceV2SharingService({ post } as any);
    await expect(service.createInvitation(deviceId, 'viewer', 'op', undefined, ' Reader@Example.COM '))
      .resolves.toMatchObject({ targeted: true, invitationCode: undefined });
    expect(post).toHaveBeenCalledWith(API.DEVICE_V2.SHARE_INVITATIONS(deviceId),
      { role: 'viewer', recipientAccount: 'reader@example.com' }, { headers: { 'Idempotency-Key': 'op' } });
    data.invitationCode = 'A'.repeat(43);
    await expect(service.createInvitation(deviceId, 'viewer', 'op', undefined, 'reader@example.com')).rejects.toThrow();
    delete data.invitationCode; data.targeted = false;
    await expect(service.createInvitation(deviceId, 'viewer', 'op', undefined, 'reader@example.com')).rejects.toThrow();
    post.mockClear();
    await expect(service.createInvitation(deviceId, 'viewer', 'op', undefined, 'nickname')).rejects.toThrow(/邮箱/);
    expect(post).not.toHaveBeenCalled();
  });

  it('uses only authenticated V2 invitation and access-grant resources', async () => {
    const get = vi.fn((url: string) => of(
      url === API.DEVICE_V2.RECEIVED_SHARES
        ? { status: 200, data: { devices: [{
          logicalDeviceId: deviceId,
          tenantId: 'target-tenant',
          name: 'Shared lamp',
          deviceType: 'diy',
          cloudEnabled: true,
          cloudReachable: true,
          cloudLastSeenAt: 1200,
          manifestRevision: 2,
          manifestFingerprint: 'ab'.repeat(32),
          manifestUpdatedAt: 1100,
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
      tenantId: 'target-tenant',
      cloudEnabled: true,
      cloudReachable: true,
      manifestRevision: 2,
      share: { role: 'operator' },
    }]);
    await expect(service.createInvitation(
      deviceId,
      'operator',
      'share-operation-one',
    )).resolves.toMatchObject({ invitationCode: 'A'.repeat(43) });
    await expect(service.acceptInvitation('A'.repeat(43)))
      .resolves.toMatchObject({ share: { shareId: 'share-one' }, realtimeRefreshPending: false });

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
        : mutation(4),
    ));
    const service = new DeviceV2SharingService({ patch, delete: remove } as any);

    await expect(service.updateShare(deviceId, grant.shareId, 'viewer'))
      .resolves.toMatchObject({ share: { role: 'viewer', version: 2 } });
    await expect(service.revokeShare(deviceId, grant.shareId))
      .resolves.toMatchObject({ share: { state: 'revoked', version: 3 } });
    await expect(service.leaveShare(deviceId)).resolves.toMatchObject({ share: { state: 'revoked', version: 4 } });

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

  it('loads a bounded authenticated target inbox without exposing a bearer code', async () => {
    const id = 'A'.repeat(22), next = 'B'.repeat(21) + 'Q';
    const item: any = { invitationId: id, state: 'pending', targeted: true, role: 'viewer', commandEndpointKeys: null,
      expiresAt: 2000, logicalDeviceId: deviceId, deviceName: 'Lamp', deviceType: 'diy' };
    const data: any = { items: [item], nextCursor: id };
    const get = vi.fn(() => of({ status: 200, data }));
    const service = new DeviceV2SharingService({ get } as any);
    expect(isGatewayUrl(API.DEVICE_V2.INVITATION_INBOX)).toBe(true);
    expect((await service.listPendingInvitations()).items[0].invitationId).toBe(id);
    expect(get).toHaveBeenCalledWith(API.DEVICE_V2.INVITATION_INBOX, { params: { limit: '20' } });
    await expect(service.listPendingInvitations(id)).rejects.toThrow(/分页/);
    data.nextCursor = next; await expect(service.listPendingInvitations()).rejects.toThrow(/分页/);
    data.nextCursor = null; item.invitationCode = 'A'.repeat(43);
    await expect(service.listPendingInvitations()).rejects.toThrow();
    delete item.invitationCode; item.targeted = false;
    await expect(service.listPendingInvitations()).rejects.toThrow();
  });

  it('uses the same preview/accept API for an ID but only exposes directed decline', async () => {
    const id = 'A'.repeat(22);
    let value: any = { invitationId: id, state: 'pending', targeted: true, role: 'viewer', commandEndpointKeys: null,
      expiresAt: 2000, logicalDeviceId: deviceId, deviceName: 'Lamp', deviceType: 'diy', currentShare: null };
    const post = vi.fn(() => of({ status: 200, data: value }));
    const service = new DeviceV2SharingService({ post } as any);
    await expect(service.previewInvitation({ invitationId: id })).resolves.toMatchObject({ targeted: true });
    expect(post).toHaveBeenCalledWith(API.DEVICE_V2.PREVIEW_SHARE, { invitationId: id });
    value.targeted = false;
    await expect(service.previewInvitation({ invitationId: id })).rejects.toThrow();
    value.targeted = true; value.state = 'declined';
    await expect(service.declineInvitation(id)).resolves.toMatchObject({ state: 'declined' });
    expect(post).toHaveBeenCalledWith(API.DEVICE_V2.DECLINE_SHARE, { invitationId: id });
    expect(isGatewayUrl(API.DEVICE_V2.DECLINE_SHARE)).toBe(true);
    value.state = 'accepted'; await expect(service.declineInvitation(id)).rejects.toThrow();
    value = { logicalDeviceId: deviceId, share: grant, replayed: false, realtimeRefreshPending: true };
    await service.acceptInvitation({ invitationId: id });
    expect(post).toHaveBeenLastCalledWith(API.DEVICE_V2.ACCEPT_SHARE, { invitationId: id });
    const count = post.mock.calls.length;
    await expect(service.acceptInvitation({ invitationId: 'bad' })).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(count);
  });

  it('uses an authenticated read-only preview endpoint and rejects incomplete device metadata', async () => {
    const data: any = { invitationId: 'invite', state: 'pending', role: 'viewer', commandEndpointKeys: null,
      expiresAt: 2000, logicalDeviceId: deviceId, deviceName: 'Lamp', deviceType: 'diy', currentShare: null };
    const post = vi.fn(() => of({ status: 200, data }));
    const service = new DeviceV2SharingService({ post } as any);
    expect(isGatewayUrl(API.DEVICE_V2.PREVIEW_SHARE)).toBe(true);
    await expect(service.previewInvitation('A'.repeat(43))).resolves.toMatchObject({ deviceName: 'Lamp', currentShare: null });
    expect(post).toHaveBeenCalledWith(API.DEVICE_V2.PREVIEW_SHARE, { invitationCode: 'A'.repeat(43) });
    data.deviceName = '';
    await expect(service.previewInvitation('A'.repeat(43))).rejects.toThrow();
  });

  it('retains pending and revoked replay instead of treating every acceptance as a new share', async () => {
    const data = { logicalDeviceId: deviceId, share: { ...grant, state: 'revoked', version: 2, revokedAt: 2000 },
      replayed: true, realtimeRefreshPending: true, presenceRotationRequired: true };
    const post = vi.fn(() => of({ status: 200, data }));
    const service = new DeviceV2SharingService({ post } as any);
    await expect(service.acceptInvitation('A'.repeat(43))).resolves.toEqual(data);
  });

  it('fails closed for missing synchronization state and mismatched mutation device', async () => {
    const data: any = { logicalDeviceId: deviceId, share: grant, replayed: false };
    const patch = vi.fn(() => of({ status: 200, data }));
    const service = new DeviceV2SharingService({ patch } as any);
    await expect(service.updateShare(deviceId, grant.shareId, 'operator')).rejects.toThrow(/同步响应/);
    data.realtimeRefreshPending = false; data.logicalDeviceId = 'wrong-device';
    await expect(service.updateShare(deviceId, grant.shareId, 'operator')).rejects.toThrow(/同步响应/);
  });

  it('rejects shared-device presence that does not match the V2 contract', async () => {
    const get = vi.fn(() => of({ status: 200, data: { devices: [{
      logicalDeviceId: deviceId,
      tenantId: 'target-tenant',
      name: 'Shared lamp',
      deviceType: 'diy',
      cloudEnabled: true,
      cloudReachable: 'nearby',
      cloudLastSeenAt: null,
      manifestRevision: null,
      manifestFingerprint: null,
      manifestUpdatedAt: null,
      share: grant,
    }] } }));
    const service = new DeviceV2SharingService({ get } as any);

    await expect(service.listReceived()).rejects.toThrow(/在线状态/);
  });
});
