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
  readonly routes: ReturnType<typeof decodeDeliveryBody>[] = [];

  constructor(private readonly presenceRecovery = false) {}

  async publish(payload: Uint8Array): Promise<void> {
    const frame = decodeFrame(payload);
    if (frame.kind === Bbp2MessageKind.Hello) {
      this.emit(encodeFrame({
        kind: Bbp2MessageKind.Hello,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: frame.sequence,
        body: hexToBytes(this.presenceRecovery ? 'a60002018102021a00101cc303190200041902000904'
          : 'a6000201810202191cc303190200041902000904'),
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
    this.routes.push(route);
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

  emit(payload: Uint8Array): void {
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

  it('subscribes an existing opaque Cloud identity without renaming the original card, deduplicating identical interests', async () => {
    const id = 'device_ASNFZ4mrze8BI0VniavN7w', channel = new HelloChannel();
    const client = new DeviceV2AccountClient(async () => credential(), async () => channel);
    await client.watchPresence([id, id]);
    expect(channel.presenceSubscriptions).toBe(1);
    expect(channel.routes[0].peerId).toEqual(hexToBytes('0123456789abcdef0123456789abcdef'));
    expect(client.snapshot(id).cloudReachable).toBe(false);
    expect(client.snapshot('device_01234567-89ab-cdef-0123-456789abcdef').cloudReachable).toBeNull();
    await client.stop();
  });

  it('blocks a colliding complete inventory before login and only releases the fence after a new unambiguous inventory', async () => {
    const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef', opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
    const credentials = vi.fn(async () => credential()), channel = new HelloChannel();
    const client = new DeviceV2AccountClient(credentials, async () => channel);
    await expect(client.watchPresence([uuid, opaque])).rejects.toThrow('ambiguous');
    await expect(client.start()).rejects.toThrow('ambiguous');
    expect(credentials).not.toHaveBeenCalled();
    expect(channel.presenceSubscriptions).toBe(0);
    await client.watchPresence([]);
    expect(credentials).not.toHaveBeenCalled();
    await client.watchPresence([opaque]);
    expect(channel.presenceSubscriptions).toBe(1);
    await client.stop();
  });

  it('does not claim a cancelled one-off target or retire a valid account on its behalf', async () => {
    const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef', opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
    const channel = new HelloChannel();
    const client = new DeviceV2AccountClient(async () => credential(), async () => channel);
    await client.watchPresence([uuid]);
    const abort = new AbortController(); abort.abort();
    await expect(client.waitUntilReady(opaque, abort.signal)).rejects.toMatchObject({ code: 'DEVICE_V2_READY_CANCELLED' });
    expect(client.state).toBe('ready');
    expect(channel.closed).toBe(false);
    expect(channel.presenceSubscriptions).toBe(1);
    await client.stop();
  });

  it('an empty inventory cannot remap an already bound peer in the still-live account', async () => {
    const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef', opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
    const channel = new HelloChannel();
    const client = new DeviceV2AccountClient(async () => credential(), async () => channel);
    await client.watchPresence([uuid]);
    await client.watchPresence([]);
    expect(client.state).toBe('ready');
    expect(channel.presenceSubscriptions).toBe(1);
    await expect(client.ensureReady(opaque)).rejects.toThrow('ambiguous');
    expect(channel.closed).toBe(true);
    await client.reset();
  });

  it('a real Presence loss cannot claim into a replacement account session through a synchronous Store listener', async () => {
    const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef', opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
    const channels = [new HelloChannel(true), new HelloChannel(true)], factory = vi.fn()
      .mockResolvedValueOnce(channels[0]).mockResolvedValueOnce(channels[1]);
    const client = new DeviceV2AccountClient(async () => credential(), factory);
    await client.watchPresence([uuid]);
    const old = client['session']!;
    let stopped: Promise<void> | undefined, replacement: Promise<void> | undefined;
    const detach = client.store.subscribe((id, snapshot) => {
      if (id !== uuid || !snapshot.cloudPresenceLost || replacement) return;
      stopped = client.stop();
      replacement = client.watchPresence([opaque]);
    });
    const request = channels[0].routes[0];
    const body = new Uint8Array(19); body.set([0xa1, 0, 0x50]); body.set(request.requestId!, 3);
    channels[0].emit(encodeFrame({ kind: Bbp2MessageKind.Delivery, flags: Bbp2FrameFlag.IsResponse, sequence: 201,
      body: encodeDeliveryBody({ peerKind: request.peerKind, peerId: request.peerId,
        messageKind: Bbp2MessageKind.PresenceLost, messageFlags: 0, messageBody: body }) }));
    expect(replacement).toBeDefined();
    await stopped; await replacement;
    expect(old.state).toBe('closed');
    expect(client.state).toBe('ready');
    expect(channels[1].presenceSubscriptions).toBe(1);
    expect(channels[1].closed).toBe(false);
    expect(client.snapshot(opaque).cloudReachable).toBe(false);
    expect(() => old['peerId'](uuid)).toThrow('session changed');
    expect(client.state).toBe('ready');
    detach(); await client.reset();
  });

  it('retires the active session, old waits and pending work when a one-off target collides with an earlier route', async () => {
    const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef', opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
    const channel = new HelloChannel(), credentials = vi.fn(async () => credential());
    const client = new DeviceV2AccountClient(credentials, async () => channel);
    await client.watchPresence([uuid]);
    const old = client['session']!;
    const wait = client.waitUntilReady(uuid).catch(error => error);
    const work = old.ensureReady(uuid).catch(error => error);
    await expect(client.ensureReady(opaque)).rejects.toThrow('ambiguous');
    expect(old.state).toBe('closed');
    expect(channel.closed).toBe(true);
    expect(await wait).toMatchObject({ code: 'DEVICE_V2_READY_RETIRED' });
    expect(await work).toBeInstanceOf(Error);
    await expect(client.command(uuid, 'power', true)).rejects.toThrow('ambiguous');
    expect(credentials).toHaveBeenCalledOnce();
    expect(client.snapshot(uuid).cloudReachable).toBeNull();
    await client.reset();
  });

  it('does not let a stale inventory login or late channel message revive a collision-fenced account', async () => {
    const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef', opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
    let finish!: (value: AccountConnectionResponse) => void;
    const login = new Promise<AccountConnectionResponse>(resolve => { finish = resolve; });
    const channel = new HelloChannel(), channels = vi.fn(async () => channel);
    const client = new DeviceV2AccountClient(() => login, channels);
    const old = client.watchPresence([uuid]).catch(error => error);
    await expect(client.watchPresence([uuid, opaque])).rejects.toThrow('ambiguous');
    finish(credential());
    expect(await old).toBeInstanceOf(Error);
    expect(channels).not.toHaveBeenCalled();
    expect(client.state).toBe('stopped');
    await expect(client.start()).rejects.toThrow('ambiguous');
    await client.reset();
    await client.watchPresence([opaque]);
    const active = client['session']!;
    await expect(client.watchPresence([uuid, opaque])).rejects.toThrow('ambiguous');
    channel.emit(encodeFrame({ kind: Bbp2MessageKind.Delivery, flags: Bbp2FrameFlag.IsResponse, sequence: 77,
      body: encodeDeliveryBody({ peerKind: 0, peerId: hexToBytes('0123456789abcdef0123456789abcdef'),
        messageKind: Bbp2MessageKind.Presence, messageFlags: 0, messageBody: hexToBytes('a200f50101') }) }));
    expect(active.state).toBe('closed');
    expect(client.snapshot(opaque).cloudReachable).toBeNull();
    await client.reset();
  });

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

  it('suspends all account entry paths without requesting credentials or resuming on release', async () => {
    vi.useFakeTimers();
    const credentials = vi.fn(async () => credential()), factory = vi.fn(async () => new HelloChannel());
    const client = new DeviceV2AccountClient(credentials, factory);
    const id = 'device_01234567-89ab-cdef-0123-456789abcdef';
    await client.setSuspended(true);
    await expect(client.start()).rejects.toMatchObject({ code: 'DEVICE_V2_ACCOUNT_SUSPENDED' });
    await expect(client.ensureReady(id)).rejects.toMatchObject({ code: 'DEVICE_V2_ACCOUNT_SUSPENDED' });
    await expect(client.watchPresence([id])).rejects.toMatchObject({ code: 'DEVICE_V2_ACCOUNT_SUSPENDED' });
    await vi.advanceTimersByTimeAsync(120_000); expect(credentials).not.toHaveBeenCalled();
    await client.setSuspended(false);
    await vi.advanceTimersByTimeAsync(120_000); expect(credentials).not.toHaveBeenCalled();
    await client.start(); expect(credentials).toHaveBeenCalledOnce(); expect(factory).toHaveBeenCalledOnce();
    await client.stop();
  });

  it('aborts an in-flight credential attempt and fences its late result after release', async () => {
    vi.useFakeTimers();
    let finish!: (value: AccountConnectionResponse) => void, signal: AbortSignal | undefined;
    const pending = new Promise<AccountConnectionResponse>(resolve => { finish = resolve; });
    const credentials = vi.fn((value?: AbortSignal) => { signal = value; return pending; });
    const factory = vi.fn(async () => new HelloChannel());
    const client = new DeviceV2AccountClient(credentials, factory);
    const work = client.start();
    await client.setSuspended(true); expect(signal?.aborted).toBe(true);
    await client.setSuspended(false); finish(credential()); await work;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(credentials).toHaveBeenCalledOnce(); expect(factory).not.toHaveBeenCalled();
    await client.start(); expect(credentials).toHaveBeenCalledTimes(2); expect(factory).toHaveBeenCalledOnce();
    await client.stop();
  });

  it('retires the existing session and expiry without clearing cached targets or presence demand', async () => {
    vi.useFakeTimers();
    const credentials = vi.fn(async () => credential()), channels: HelloChannel[] = [];
    const client = new DeviceV2AccountClient(credentials, async () => {
      const channel = new HelloChannel(); channels.push(channel); return channel;
    });
    const id = 'device_01234567-89ab-cdef-0123-456789abcdef', store = client.store;
    await client.watchPresence([id]);
    store.applyPresence(id, { cloudReachable: true, cloudLastSeenAt: 123 });
    await client.setSuspended(true);
    expect(channels[0]!.closed).toBe(true); expect(client.store).toBe(store);
    expect(client.snapshot(id).cloudLastSeenAt).toBe(123);
    expect(client.snapshot(id).cloudReachable).toBe(null); // Cached, never fresh transport evidence.
    await vi.advanceTimersByTimeAsync(600_000); expect(credentials).toHaveBeenCalledOnce();
    await client.setSuspended(false);
    await vi.advanceTimersByTimeAsync(600_000); expect(credentials).toHaveBeenCalledOnce();
    await client.start(); expect(channels[1]!.presenceSubscriptions).toBe(1);
    await client.stop();
  });

  it('cancels a scheduled reconnect and does not replay it when Local retires', async () => {
    vi.useFakeTimers();
    const credentials = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(credential());
    const client = new DeviceV2AccountClient(credentials, async () => new HelloChannel());
    await expect(client.start()).rejects.toThrow('offline'); expect(client.state).toBe('retrying');
    await client.setSuspended(true); await client.setSuspended(false);
    await vi.advanceTimersByTimeAsync(120_000); expect(credentials).toHaveBeenCalledOnce();
    await client.start(); expect(credentials).toHaveBeenCalledTimes(2);
    await client.stop();
  });

  it.each(['ready', 'retrying'] as const)('fences reentrant %s suspension and stale timer callbacks after release', async state => {
    vi.useFakeTimers();
    const response = credential(); response.mqtt.expiresIn = 1;
    const credentials = vi.fn().mockResolvedValue(response);
    if (state === 'retrying') credentials.mockRejectedValueOnce(Error('fixture offline'));
    const client = new DeviceV2AccountClient(credentials, async () => new HelloChannel());
    let retirement: Promise<void> | undefined;
    client.subscribeState(value => {
      if (value === state && !retirement) retirement = client.setSuspended(true);
    });
    await client.start().catch(() => undefined); await retirement;
    expect(retirement).toBeDefined(); expect(vi.getTimerCount()).toBe(0);
    await client.setSuspended(false); await vi.advanceTimersByTimeAsync(2000);
    expect(credentials).toHaveBeenCalledOnce(); await client.stop();

    // A previously queued callback can race cancellation. It must not clear a
    // replacement timer or start work even after Local has since released.
    const nextCredentials = vi.fn().mockResolvedValue(response);
    if (state === 'retrying') nextCredentials.mockRejectedValueOnce(Error('fixture offline'));
    const next = new DeviceV2AccountClient(nextCredentials, async () => new HelloChannel());
    const timers = vi.spyOn(globalThis, 'setTimeout');
    try {
      await next.start().catch(() => undefined);
      const last = timers.mock.calls.at(-1)!;
      expect(last[1]).toBe(1000); // Existing refresh/reconnect timings are unchanged.
      const stale = last[0] as () => void;
      await next.setSuspended(true); await next.setSuspended(false);
      stale(); await Promise.resolve(); await Promise.resolve();
      expect(nextCredentials).toHaveBeenCalledOnce();
      await next.stop();
    } finally { timers.mockRestore(); }
  });
});
