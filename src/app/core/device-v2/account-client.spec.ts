import { describe, expect, it, vi } from 'vitest';

import {
  Bbp2FrameFlag,
  Bbp2MessageKind,
  DeviceV2Channel,
  decodeFrame,
  encodeFrame,
  hexToBytes,
} from '../protocol/device-v2';
import { AccountConnectionResponse } from '../model/response.model';
import { DeviceV2AccountClient } from './account-client';

function ackBody(sequence: number): Uint8Array {
  return Uint8Array.of(0xa1, 0x00, sequence);
}

class HelloChannel implements DeviceV2Channel {
  private readonly messages = new Set<(payload: Uint8Array) => void>();
  private readonly closes = new Set<(reason?: unknown) => void>();
  closed = false;

  async publish(payload: Uint8Array): Promise<void> {
    const frame = decodeFrame(payload);
    if (frame.kind !== Bbp2MessageKind.Hello) return;
    this.emit(encodeFrame({
      kind: Bbp2MessageKind.Hello,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: frame.sequence,
      body: hexToBytes('a60002018102021904c303190200041902000904'),
    }));
    this.emit(encodeFrame({
      kind: Bbp2MessageKind.Ack,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 100,
      body: ackBody(frame.sequence),
    }));
  }

  onMessage(listener: (payload: Uint8Array) => void): () => void {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }

  onClose(listener: (reason?: unknown) => void): () => void {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }

  fail(): void {
    this.closed = true;
    for (const listener of this.closes) listener(new Error('network lost'));
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  private emit(payload: Uint8Array): void {
    for (const listener of this.messages) listener(payload);
  }
}

class FailedHelloChannel extends HelloChannel {
  override async publish(): Promise<void> {
    throw new Error('publish failed');
  }
}

function credential(): AccountConnectionResponse {
  return {
    account: { accountId: 'user', tenantId: 'tenant' },
    mqtt: {
      host: 'mqtt.example.test',
      port: 443,
      protocol: 'wss',
      url: 'wss://mqtt.example.test/mqtt',
      path: '/mqtt',
      clientId: 'appu-user-a1b2c3d4',
      username: 'appu_user',
      password: 'jwt',
      expiresIn: 600,
      publishTopic: '/device/appu-user-a1b2c3d4/s',
      subscribeTopic: '/device/appu-user-a1b2c3d4/r',
      keepalive: 60,
      clean: true,
    },
    wire: 'bbp2',
    protocolVersion: 2,
    transport: 'websocket',
    shard: { shard_id: 0, route_version: 1 },
  };
}

describe('DeviceV2AccountClient', () => {
  it('shares one account session, coalesces start, and rebuilds after transport loss', async () => {
    const credentials = vi.fn(async () => credential());
    const channels: HelloChannel[] = [];
    const factory = vi.fn(async () => {
      const channel = new HelloChannel();
      channels.push(channel);
      return channel;
    });
    const client = new DeviceV2AccountClient(credentials, factory, {
      reconnectBaseMs: 1,
      reconnectMaximumMs: 2,
    });

    await Promise.all([client.start(), client.start()]);
    expect(client.state).toBe('ready');
    expect(credentials).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();

    channels[0]!.fail();
    await vi.waitFor(() => expect(credentials).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(client.state).toBe('ready'));
    expect(channels).toHaveLength(2);
    expect(channels[0]!.closed).toBe(true);

    await client.stop();
    expect(client.state).toBe('stopped');
    expect(channels[1]!.closed).toBe(true);
  });

  it('rejects a credential that is not explicitly BBP/2 over WebSocket', async () => {
    const invalid = credential();
    invalid.transport = 'tcp';
    const client = new DeviceV2AccountClient(
      async () => invalid,
      async () => new HelloChannel(),
      { reconnectBaseMs: 60_000, reconnectMaximumMs: 60_000 },
    );
    await expect(client.start()).rejects.toThrow(/credential contract/);
    await client.stop();
  });

  it('closes a channel when the protocol session cannot start', async () => {
    const channel = new FailedHelloChannel();
    const client = new DeviceV2AccountClient(
      async () => credential(),
      async () => channel,
      { reconnectBaseMs: 60_000, reconnectMaximumMs: 60_000 },
    );
    await expect(client.start()).rejects.toThrow('publish failed');
    expect(channel.closed).toBe(true);
    await client.stop();
  });
});
