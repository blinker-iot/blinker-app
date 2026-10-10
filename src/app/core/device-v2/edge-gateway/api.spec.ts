import { of } from 'rxjs';

import { API } from '../../../configs/api.config';
import { EdgeGatewayTopologyState } from '../../protocol/device-v2';
import { base64UrlEncode } from '../ble-direct/wire';
import { HttpEdgeGatewayAttachApi } from './api';

const bytes = (value: number, size = 16) => new Uint8Array(size).fill(value);

function response(state = 'PendingChildInstall') {
  return {
    status: 201,
    headers: { get: () => 'private, no-store' },
    body: {
      status: 201,
      data: {
        topology: {
          operationId: base64UrlEncode(bytes(0x11)),
          edgeHubLogicalDeviceId: 'device_hub',
          childLogicalDeviceId: 'device_child',
          childDeviceInstanceId: base64UrlEncode(bytes(0x12)),
          accessEpoch: 3,
          controllerId: base64UrlEncode(bytes(0x13)),
          credentialVersion: 1,
          presenceKeyVersion: 2,
          topologyVersion: 2,
          topologyState: EdgeGatewayTopologyState.PendingChildInstall,
          state,
          credentialExpiresAt: 9_000_000,
          deliveryExpiresAt: 2_000_000,
          edgeHubStored: true,
          childInstalled: false,
          gatewayProven: false,
          updatedAt: 1_000_000,
          replayed: false,
        },
      },
    },
  };
}

describe('HttpEdgeGatewayAttachApi', () => {
  it('sends only the owner-selected identities and operation idempotency key', async () => {
    const post = vi.fn((..._args: unknown[]) => of(response()));
    const api = new HttpEdgeGatewayAttachApi(
      { post } as unknown as ConstructorParameters<typeof HttpEdgeGatewayAttachApi>[0],
    );
    const operationId = bytes(0x11);

    const result = await api.create({
      operationId,
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
      childDeviceInstanceId: bytes(0x12),
    });

    expect(result.topology.topologyState).toBe(
      EdgeGatewayTopologyState.PendingChildInstall,
    );
    const [url, body, options] = post.mock.calls[0]! as [
      string,
      Record<string, unknown>,
      { headers: { get(name: string): string | null } },
    ];
    expect(url).toBe(API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENTS);
    expect(body).toEqual({
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
      childDeviceInstanceId: base64UrlEncode(bytes(0x12)),
    });
    expect(options.headers.get('Idempotency-Key')).toBe(base64UrlEncode(operationId));
  });

  it('rejects a contradictory topology state and a cacheable response', async () => {
    const contradictory = new HttpEdgeGatewayAttachApi({
      post: () => of(response('Active')),
    } as unknown as ConstructorParameters<typeof HttpEdgeGatewayAttachApi>[0]);
    const request = {
      operationId: bytes(0x11),
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'device_child',
      childDeviceInstanceId: bytes(0x12),
    };
    await expect(contradictory.create(request))
      .rejects.toThrow('EDGE_GATEWAY_TOPOLOGY_INVALID');

    const cacheable = response();
    cacheable.headers.get = () => 'private';
    const cacheableApi = new HttpEdgeGatewayAttachApi({
      post: () => of(cacheable),
    } as unknown as ConstructorParameters<typeof HttpEdgeGatewayAttachApi>[0]);
    await expect(cacheableApi.create(request))
      .rejects.toThrow('EDGE_GATEWAY_CACHE_POLICY_INVALID');
  });

  it('uses explicit no-secret endpoints for nearby revocation recovery', async () => {
    const recovered = response('Revoking');
    recovered.status = 200;
    recovered.body.status = 200;
    recovered.body.data.topology.topologyState = EdgeGatewayTopologyState.Revoking;
    Object.assign(recovered.body.data, {
      recovery: {
        operation: 3,
        grantId: base64UrlEncode(bytes(0x21)),
        controllerId: base64UrlEncode(bytes(0x13)),
        credentialVersion: 1,
        expiresAt: 2_100_000,
        exactGrant: base64UrlEncode(bytes(0x22, 120)),
      },
    });
    const post = vi.fn((..._args: unknown[]) => of(recovered));
    const api = new HttpEdgeGatewayAttachApi(
      { post } as unknown as ConstructorParameters<typeof HttpEdgeGatewayAttachApi>[0],
    );
    const operationId = bytes(0x11);
    const nonce = bytes(0x31);

    const prepared = await api.prepareRevocationRecovery(operationId, nonce);
    await api.confirmRevocationRecovery(operationId, bytes(0x41, 64));

    expect(prepared.recovery?.operation).toBe(3);
    expect(post.mock.calls[0]![0]).toBe(
      `${API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENT(base64UrlEncode(operationId))}/recover`,
    );
    expect(post.mock.calls[0]![1]).toEqual({ controlNonce: base64UrlEncode(nonce) });
    expect(post.mock.calls[1]![0]).toBe(
      `${API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENT(base64UrlEncode(operationId))}/recover-receipt`,
    );
    expect(JSON.stringify(post.mock.calls)).not.toContain('gatewaySecret');
  });

  it('starts revocation through the typed detach endpoint', async () => {
    const revoking = response('Revoking');
    revoking.status = 200;
    revoking.body.status = 200;
    revoking.body.data.topology.topologyState = EdgeGatewayTopologyState.Revoking;
    const post = vi.fn((..._args: unknown[]) => of(revoking));
    const api = new HttpEdgeGatewayAttachApi(
      { post } as unknown as ConstructorParameters<typeof HttpEdgeGatewayAttachApi>[0],
    );
    const operationId = bytes(0x11);

    const result = await api.detach(operationId);

    expect(result.topology.topologyState).toBe(EdgeGatewayTopologyState.Revoking);
    expect(post).toHaveBeenCalledWith(
      `${API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENT(base64UrlEncode(operationId))}/detach`,
      {},
      { observe: 'response' },
    );
  });
});
