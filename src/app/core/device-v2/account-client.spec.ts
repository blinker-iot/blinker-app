import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Bbp2FrameFlag,
  Bbp2MessageKind,
  DeviceV2Channel,
  decodeDeliveryBody,
  decodeFrame,
  encodeDeliveryBody,
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
  presenceSubscriptions = 0;

  async publish(payload: Uint8Array): Promise<void> {
    const frame = decodeFrame(payload);
    if (frame.kind === Bbp2MessageKind.Hello) {
      this.emit(encodeFrame({
        kind: Bbp2MessageKind.Hello,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: frame.sequence,
        body: hexToBytes('a6000201810202191cc303190200041902000904'),
      }));
      this.emit(encodeFrame({
        kind: Bbp2MessageKind.Ack,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: 100,
        body: ackBody(frame.sequence),
      }));
      return;
    }
    if (frame.kind !== Bbp2MessageKind.Route) return;
    const route = decodeDeliveryBody(frame.body);
    if (route.messageKind !== Bbp2MessageKind.PresenceControl) return;
    this.presenceSubscriptions += 1;
    this.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 101 + this.presenceSubscriptions,
      body: encodeDeliveryBody({
        peerKind: route.peerKind,
        peerId: route.peerId,
        requestId: route.requestId,
        messageKind: Bbp2MessageKind.Presence,
        messageFlags: Bbp2FrameFlag.IsResponse,
        messageBody: hexToBytes('a200f401f6'),
      }),
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
afterEach(() => vi.useRealTimers());

it('target-level errors do not reconnect the account', async () => {
  vi.useFakeTimers();
  const channel = new HelloChannel(), channels = vi.fn(async () => channel);
  const client = new DeviceV2AccountClient(async () => credential(), channels);
  await client.start();
  const session = client['session']!;
  session['emitError'](new Error('Presence recovery exhausted'));
  await vi.advanceTimersByTimeAsync(20000);
  expect(channels).toHaveBeenCalledTimes(1); expect(session.state).toBe('ready');
  await client.stop();
});

  it.each(['acquireConnectionDemand', 'reserveDirectPriority', 'acquireStateInterest'] as const)('a cancelled late account login cannot %s', async method => {
    let finish!: (value: AccountConnectionResponse) => void;
    const credentialPending = new Promise<AccountConnectionResponse>(resolve => { finish = resolve; });
    const channel = new HelloChannel();
    const client = new DeviceV2AccountClient(() => credentialPending, async () => channel);
    const abort = new AbortController();
    const result = client[method]('ble_ASNFZ4mrze8BI0VniavN7w', abort.signal).catch(error => error);
    abort.abort(); finish(credential());
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(channel.presenceSubscriptions).toBe(0);
    await client.stop();
  });

  it.each(['acquireConnectionDemand', 'reserveDirectPriority', 'acquireStateInterest'] as const)('pre-cancel does not start account login for %s', async method => {
    const credentials = vi.fn(async () => credential());
    const client = new DeviceV2AccountClient(credentials, async () => new HelloChannel());
    const abort = new AbortController(); abort.abort();
    await expect(client[method]('ble_ASNFZ4mrze8BI0VniavN7w', abort.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(credentials).not.toHaveBeenCalled();
    await client.stop();
  });

  it('cancels a hung old login without blocking reset or routing its control into the next account', async () => {
    let release!: (value: AccountConnectionResponse) => void;
    const oldLogin = new Promise<AccountConnectionResponse>(resolve => { release = resolve; });
    const credentials = vi.fn().mockReturnValueOnce(oldLogin).mockResolvedValue(credential());
    const channel = new HelloChannel();
    const factory = vi.fn(async () => channel);
    const client = new DeviceV2AccountClient(credentials, factory);
    const id = 'device_01234567-89ab-cdef-0123-456789abcdef';
    const wait = client.waitUntilReady(id).catch(error => error);
    const command = client.command(id, 'power', true).catch(error => error);
    const direct = client.reserveDirectPriority(id, new AbortController().signal).catch(error => error);
    await Promise.resolve();
    await client.reset();
    expect(await wait).toMatchObject({ code: 'DEVICE_V2_READY_RETIRED' });
    await client.start();
    release(credential());
    expect(await command).toMatchObject({ message: 'Device V2 account session changed' });
    expect(await direct).toMatchObject({ message: 'Device V2 account session changed' });
    expect(factory).toHaveBeenCalledOnce();
    expect(client.state).toBe('ready');
    await client.stop();
  });

  it('shares offline waits and releases callers on stop while preserving cached Presence', async () => {
    const channel = new HelloChannel();
    const client = new DeviceV2AccountClient(async () => credential(), async () => channel);
    const id = 'device_01234567-89ab-cdef-0123-456789abcdef';
    await client.watchPresence([id]);
    const first = client.waitUntilReady(id).catch(error => error);
    const second = client.waitUntilReady(id).catch(error => error);
    await Promise.resolve();
    await client.stop();
    expect(await first).toMatchObject({ code: 'DEVICE_V2_READY_RETIRED' });
    expect(await second).toMatchObject({ code: 'DEVICE_V2_READY_RETIRED' });
    expect(channel.presenceSubscriptions).toBe(1);
    expect(channel.closed).toBe(true);
  });

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

  it('restores inventory Presence subscriptions after reconnect', async () => {
    const channels: HelloChannel[] = [];
    const client = new DeviceV2AccountClient(
      async () => credential(),
      async () => {
        const channel = new HelloChannel();
        channels.push(channel);
        return channel;
      },
      { reconnectBaseMs: 1, reconnectMaximumMs: 2 },
    );
    const logicalDeviceId = 'device_01234567-89ab-cdef-0123-456789abcdef';

    await client.watchPresence([logicalDeviceId]);
    expect(channels[0]?.presenceSubscriptions).toBe(1);
    channels[0]!.fail();
    await vi.waitFor(() => expect(channels).toHaveLength(2));
    await vi.waitFor(() => expect(client.state).toBe('ready'));
    expect(channels[1]?.presenceSubscriptions).toBe(1);
    expect(client.snapshot(logicalDeviceId).cloudReachable).toBe(false);
    await client.stop();
  });

  it('blocks a deterministic credential error without reconnecting or reacquiring it', async () => {
    vi.useFakeTimers();
    const invalid = credential();
    invalid.transport = 'tcp';
    const credentials = vi.fn(async () => invalid);
    const factory = vi.fn(async () => new HelloChannel());
    const client = new DeviceV2AccountClient(
      credentials,
      factory,
      { reconnectBaseMs: 1, reconnectMaximumMs: 2 },
    );
    await expect(client.start()).rejects.toThrow(/credential contract/);
    expect(client.state).toBe('stopped');
    await expect(client.start()).rejects.toThrow(/credential contract/);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(credentials).toHaveBeenCalledOnce();
    expect(factory).not.toHaveBeenCalled();
    await client.stop();
  });

  it('closes the active endpoint when credential refresh returns invalid transport', async () => {
    vi.useFakeTimers();
    const first = credential();
    first.mqtt.expiresIn = 1;
    const invalid = credential();
    invalid.transport = 'tcp';
    const credentials = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(invalid);
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

    await client.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(credentials).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenCalledOnce();
    expect(channels[0]!.closed).toBe(true);
    expect(client.state).toBe('stopped');
    await expect(client.start()).rejects.toThrow(/credential contract/);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(credentials).toHaveBeenCalledTimes(2);

    await client.stop();
  });

  it('replaces endpoint A with B and ignores a late failure from A', async () => {
    vi.useFakeTimers();
    const first = credential();
    first.mqtt.url = 'wss://mqtt-a.example.test/mqtt';
    first.mqtt.expiresIn = 1;
    const second = credential();
    second.mqtt.url = 'wss://mqtt-b.example.test/mqtt';
    const credentials = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second);
    const channels: HelloChannel[] = [];
    const openedUrls: string[] = [];
    const factory = vi.fn(async (response: AccountConnectionResponse) => {
      if (channels.length > 0) expect(channels[0]!.closed).toBe(true);
      const channel = new HelloChannel();
      channels.push(channel);
      openedUrls.push(response.mqtt.url!);
      return channel;
    });
    const client = new DeviceV2AccountClient(credentials, factory, {
      reconnectBaseMs: 1,
      reconnectMaximumMs: 2,
    });

    await client.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(openedUrls).toEqual([
      'wss://mqtt-a.example.test/mqtt',
      'wss://mqtt-b.example.test/mqtt',
    ]);
    expect(credentials).toHaveBeenCalledTimes(2);
    expect(channels[0]!.closed).toBe(true);
    expect(channels[1]!.closed).toBe(false);
    expect(client.state).toBe('ready');

    channels[0]!.fail();
    await vi.advanceTimersByTimeAsync(10);
    expect(credentials).toHaveBeenCalledTimes(2);
    expect(channels[1]!.closed).toBe(false);
    expect(client.state).toBe('ready');

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
