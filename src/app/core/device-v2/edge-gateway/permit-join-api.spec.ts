import { of } from 'rxjs';

import { API } from '../../../configs/api.config';
import { base64UrlEncode } from '../ble-direct/wire';
import { HttpEdgeGatewayPermitJoinApi } from './permit-join-api';

const bytes = (value: number, size = 16) => new Uint8Array(size).fill(value);
const operationId = bytes(0x11);
const headers = { get: () => 'private, no-store' };

function windowResponse() {
  return {
    status: 201,
    headers,
    body: {
      status: 201,
      data: {
        operationId: base64UrlEncode(operationId),
        edgeHubLogicalDeviceId: 'device_hub',
        adapterId: 1,
        state: 'ready',
        expiresAt: 9_000_000,
        readyAt: 1_000_000,
        closedAt: null,
        updatedAt: 1_000_000,
        replayed: false,
      },
    },
  };
}

describe('HttpEdgeGatewayPermitJoinApi', () => {
  it('opens only the selected Hub adapter with an operation-bound idempotency key', async () => {
    const post = vi.fn((..._args: unknown[]) => of(windowResponse()));
    const api = new HttpEdgeGatewayPermitJoinApi(
      { post } as unknown as ConstructorParameters<typeof HttpEdgeGatewayPermitJoinApi>[0],
    );

    await expect(api.open(operationId, 'device_hub', 1))
      .resolves.toMatchObject({ state: 'ready', adapterId: 1 });
    const [url, body, options] = post.mock.calls[0]!;
    expect(url).toBe(API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOINS);
    expect(body).toEqual({ edgeHubLogicalDeviceId: 'device_hub', adapterId: 1 });
    expect((options as { headers: { get(name: string): string | null } })
      .headers.get('Idempotency-Key')).toBe(base64UrlEncode(operationId));
  });

  it('decodes only no-store, operation-bound relay mailboxes', async () => {
    const relay = {
      status: 200,
      headers,
      body: {
        status: 200,
        data: {
          operationId: base64UrlEncode(operationId),
          relaySessionId: base64UrlEncode(bytes(0x71)),
          revision: 0,
          candidateSnapshot: null,
          selectResult: null,
          downAck: null,
          upstreamBatch: null,
          expiresAt: 9_000_000,
        },
      },
    };
    const get = vi.fn((..._args: unknown[]) => of(relay));
    const api = new HttpEdgeGatewayPermitJoinApi(
      { get } as unknown as ConstructorParameters<typeof HttpEdgeGatewayPermitJoinApi>[0],
    );

    await expect(api.readRelay(operationId)).resolves.toMatchObject({ revision: 0 });
    relay.body.data.operationId = base64UrlEncode(bytes(0x22));
    await expect(api.readRelay(operationId))
      .rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_MISMATCH');
    relay.body.data.operationId = base64UrlEncode(operationId);
    relay.headers = { get: () => 'private' };
    await expect(api.readRelay(operationId))
      .rejects.toThrow('EDGE_GATEWAY_PERMIT_JOIN_CACHE_POLICY_INVALID');
  });
});
