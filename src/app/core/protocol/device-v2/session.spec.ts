import { describe, expect, it, vi } from 'vitest';

import {
  Bbp2ErrorCode,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  Bbp2RoutePeerKind,
  DeviceV2Channel,
  DeviceV2RouteError,
  DeviceV2Session,
  bytesToHex,
  decodeDeliveryBody,
  decodeFrame,
  encodeDeliveryBody,
  encodeFrame,
  hexToBytes,
  logicalDevicePeerId,
} from './index';

const logicalDeviceId = 'device_01234567-89ab-cdef-0123-456789abcdef';
const bleLogicalDeviceId = 'ble_ASNFZ4mrze8BI0VniavN7w';
const manifestPage = hexToBytes(
  'a600010158204c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf0200030204020582a50065706f7765720100020003030401a50065616c61726d0102020003080402',
);
const serverHello = hexToBytes('a6000201810202190cc303190200041902000904');
const presenceServerHello = hexToBytes('a6000201810202191cc303190200041902000904');

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function unsigned(value: number): Uint8Array {
  if (value < 24) return Uint8Array.of(value);
  if (value <= 0xff) return Uint8Array.of(0x18, value);
  return Uint8Array.of(0x19, value >> 8, value & 0xff);
}

function ackBody(sequence: number): Uint8Array {
  return concat(Uint8Array.of(0xa1, 0x00), unsigned(sequence));
}

function errorBody(code: Bbp2ErrorCode, sequence: number): Uint8Array {
  return concat(Uint8Array.of(0xa2, 0x00), unsigned(code), Uint8Array.of(0x01), unsigned(sequence));
}

class FakeChannel implements DeviceV2Channel {
  readonly published: Uint8Array[] = [];
  responder?: (payload: Uint8Array) => void | Promise<void>;
  private readonly messages = new Set<(payload: Uint8Array) => void>();
  private readonly closes = new Set<(reason?: unknown) => void>();

  async publish(payload: Uint8Array): Promise<void> {
    const copy = new Uint8Array(payload);
    this.published.push(copy);
    await this.responder?.(copy);
  }

  onMessage(listener: (payload: Uint8Array) => void): () => void {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }

  onClose(listener: (reason?: unknown) => void): () => void {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }

  emit(payload: Uint8Array): void {
    for (const listener of this.messages) listener(new Uint8Array(payload));
  }

  async close(): Promise<void> {
    for (const listener of this.closes) listener();
  }
}

function notificationBody(
  messageKind: Bbp2MessageKind.StatePage | Bbp2MessageKind.Patch | Bbp2MessageKind.Event,
  messageBody: Uint8Array,
  target = logicalDeviceId,
): Uint8Array {
  return encodeDeliveryBody({
    peerKind: Bbp2RoutePeerKind.LogicalDevice,
    peerId: logicalDevicePeerId(target),
    messageKind,
    messageFlags: Bbp2FrameFlag.IdMode,
    messageBody,
  });
}

function presenceNotificationBody(messageBody: Uint8Array): Uint8Array {
  return encodeDeliveryBody({
    peerKind: Bbp2RoutePeerKind.LogicalDevice,
    peerId: logicalDevicePeerId(logicalDeviceId),
    messageKind: Bbp2MessageKind.Presence,
    messageFlags: 0,
    messageBody,
  });
}

function requestIds(): () => Uint8Array {
  let value = 0;
  return () => new Uint8Array(16).fill(++value);
}

function installServer(
  channel: FakeChannel,
  options: {
    dropFirstManifest?: boolean;
    commandError?: Bbp2ErrorCode;
    topLevelCommandError?: boolean;
    presence?: boolean;
    presenceRecovery?: boolean;
  } = {},
): { stateBody: (body: Uint8Array) => void; manifestRequestCount: () => number } {
  let serverSequence = 100;
  let manifestRequests = 0;
  let state = hexToBytes('a5000201000202030204a101f4');
  const respond = (
    request: ReturnType<typeof decodeDeliveryBody>,
    kind: Bbp2MessageKind,
    flags: number,
    body: Uint8Array,
  ): void => channel.emit(encodeFrame({
    kind: Bbp2MessageKind.Delivery,
    flags: Bbp2FrameFlag.IsResponse,
    sequence: ++serverSequence,
    body: encodeDeliveryBody({
      peerKind: Bbp2RoutePeerKind.LogicalDevice,
      peerId: request.peerId,
      requestId: request.requestId!,
      messageKind: kind,
      messageFlags: flags,
      messageBody: body,
    }),
  }));

  channel.responder = payload => {
    const frame = decodeFrame(payload);
    if (frame.kind === Bbp2MessageKind.Hello) {
      channel.emit(encodeFrame({
        kind: Bbp2MessageKind.Hello,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: frame.sequence,
        body: options.presenceRecovery ? hexToBytes('a60002018102021a00101cc303190200041902000904')
          : options.presence ? presenceServerHello : serverHello,
      }));
      channel.emit(encodeFrame({
        kind: Bbp2MessageKind.Ack,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: ++serverSequence,
        body: ackBody(frame.sequence),
      }));
      return;
    }
    const request = decodeDeliveryBody(frame.body);
    if (request.messageKind === Bbp2MessageKind.PresenceControl) {
      respond(request, Bbp2MessageKind.Presence, Bbp2FrameFlag.IsResponse,
        hexToBytes('a200f401f6'));
    } else if (request.messageKind === Bbp2MessageKind.ManifestRequest) {
      manifestRequests += 1;
      if (options.dropFirstManifest && manifestRequests === 1) return;
      respond(request, Bbp2MessageKind.Manifest, Bbp2FrameFlag.IsResponse, manifestPage);
    } else if (request.messageKind === Bbp2MessageKind.ManifestAccept) {
      respond(request, Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse, ackBody(frame.sequence));
    } else if (request.messageKind === Bbp2MessageKind.StateRequest) {
      respond(
        request,
        Bbp2MessageKind.StatePage,
        Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode,
        state,
      );
    } else if (request.messageKind === Bbp2MessageKind.Command) {
      if (options.commandError !== undefined) {
        if (options.topLevelCommandError) {
          channel.emit(encodeFrame({
            kind: Bbp2MessageKind.Error,
            flags: Bbp2FrameFlag.IsResponse,
            sequence: ++serverSequence,
            body: errorBody(options.commandError, frame.sequence),
          }));
        } else {
          respond(
            request,
            Bbp2MessageKind.Error,
            Bbp2FrameFlag.IsResponse,
            errorBody(options.commandError, frame.sequence),
          );
        }
      } else {
        respond(request, Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse, ackBody(frame.sequence));
      }
    }
  };
  return {
    stateBody: body => { state = body; },
    manifestRequestCount: () => manifestRequests,
  };
}

describe('DeviceV2Session', () => {
  it('refreshes State without repeating a verified Manifest exchange', async () => {
    const channel = new FakeChannel();
    const server = installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    await session.ensureReady(logicalDeviceId);
    const count = channel.published.length;
    server.stateBody(hexToBytes('a5000301000202030204a101f5'));
    await session.refresh(logicalDeviceId);
    expect(server.manifestRequestCount()).toBe(1);
    expect(channel.published.slice(count).map(value => decodeDeliveryBody(decodeFrame(value).body).messageKind))
      .toEqual([Bbp2MessageKind.StateRequest]);
    expect(session.store.snapshot(logicalDeviceId).values['power']?.value).toBe(true);
    await session.close();
  });

  it('coalesces concurrent refreshes and waits for State before a Command', async () => {
    const channel = new FakeChannel();
    const server = installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    await session.ensureReady(logicalDeviceId);
    const respond = channel.responder!, count = channel.published.length;
    let release: (() => void) | undefined;
    channel.responder = payload => {
      if (decodeDeliveryBody(decodeFrame(payload).body).messageKind === Bbp2MessageKind.StateRequest) {
        return new Promise<void>(resolve => { release = () => { void respond(payload); resolve(); }; });
      }
      return respond(payload);
    };
    const first = session.refresh(logicalDeviceId), second = session.refresh(logicalDeviceId);
    const command = session.command(logicalDeviceId, 'power', true);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(channel.published.slice(count)).toHaveLength(1);
    release!();
    await Promise.all([first, second, command]);
    expect(server.manifestRequestCount()).toBe(1);
    expect(channel.published.slice(count).map(value => decodeDeliveryBody(decodeFrame(value).body).messageKind))
      .toEqual([Bbp2MessageKind.StateRequest, Bbp2MessageKind.Command]);
    await session.close();
  });

  it('registers a refresh before notifying synchronous Store subscribers', async () => {
    const channel = new FakeChannel();
    installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    await session.ensureReady(logicalDeviceId);
    const count = channel.published.length;
    let nested: Promise<void> | undefined;
    let notified = false;
    const stop = session.store.subscribe((id, snapshot) => {
      if (id !== logicalDeviceId || snapshot.stateFresh || notified) return;
      notified = true;
      nested = session.refresh(logicalDeviceId);
    });
    const first = session.refresh(logicalDeviceId);
    await first;
    expect(notified).toBe(true);
    expect(nested).toBe(first);
    await nested;
    expect(channel.published.slice(count).map(value => decodeDeliveryBody(decodeFrame(value).body).messageKind))
      .toEqual([Bbp2MessageKind.StateRequest]);
    stop();
    await session.close();
  });

  it.each([Bbp2ErrorCode.ManifestConflict, Bbp2ErrorCode.NegotiationRequired])(
    'renegotiates State once on typed server gate invalidation %s', async errorCode => {
    const channel = new FakeChannel();
    const server = installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    await session.ensureReady(logicalDeviceId);
    const respond = channel.responder!;
    let conflicted = false;
    channel.responder = payload => {
      const frame = decodeFrame(payload), request = decodeDeliveryBody(frame.body);
      if (!conflicted && request.messageKind === Bbp2MessageKind.StateRequest) {
        conflicted = true;
        channel.emit(encodeFrame({ kind: Bbp2MessageKind.Delivery, flags: Bbp2FrameFlag.IsResponse, sequence: 301,
          body: encodeDeliveryBody({ ...request, messageKind: Bbp2MessageKind.Error,
            messageFlags: Bbp2FrameFlag.IsResponse, messageBody: errorBody(errorCode, frame.sequence) }) }));
        return;
      }
      return respond(payload);
    };
    await session.refresh(logicalDeviceId);
    expect(conflicted).toBe(true);
    expect(server.manifestRequestCount()).toBe(2);
    expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(true);
    await session.close();
  });

  it('coalesces simultaneous inventory and page Presence subscriptions', async () => {
    const channel = new FakeChannel(); installServer(channel, { presence: true });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    const first = session.subscribePresence(logicalDeviceId), second = session.subscribePresence(logicalDeviceId);
    expect(first).toBe(second);
    await Promise.all([first, second]);
    const requests = channel.published.filter(payload => decodeFrame(payload).kind === Bbp2MessageKind.Route);
    expect(requests).toHaveLength(1);
    await session.close();
  });

  it('requires fresh State after offline-to-online even when the page cache was accepted', async () => {
    const channel = new FakeChannel(), server = installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.ensureReady(logicalDeviceId);
    const cached = session.store.snapshot(logicalDeviceId);
    session.store.applyPresence(logicalDeviceId, { cloudReachable: false, cloudLastSeenAt: 100 });
    session.store.applyPresence(logicalDeviceId, { cloudReachable: true, cloudLastSeenAt: 101 });
    expect(session.store.snapshot(logicalDeviceId)).toMatchObject({
      manifest: cached.manifest, values: cached.values, manifestAccepted: true, stateFresh: false,
    });
    server.stateBody(hexToBytes('a5000101000202030204a101f5')); // Device restart may reset the revision.
    await session.ensureReady(logicalDeviceId);
    expect(session.store.snapshot(logicalDeviceId)).toMatchObject({ stateFresh: true, stateRevision: 1 });
    expect(session.store.snapshot(logicalDeviceId).values['power'].value).toBe(true);
    expect(server.manifestRequestCount()).toBe(1);
    await session.close();
  });

  it.each(['internal', 'timeout', 'network'])('labels an unconfirmed Command as unknown after %s, without a fresh request', async failure => {
    const channel = new FakeChannel(); installServer(channel, { commandError: Bbp2ErrorCode.Internal });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds(), requestTimeoutMs: 5, routeRetries: 1 });
    await session.start(); await session.ensureReady(logicalDeviceId);
    if (failure !== 'internal') channel.responder = async () => {
      if (failure === 'network') await channel.close();
    };
    await expect(session.command(logicalDeviceId, 'power', true)).rejects.toMatchObject({ code: 'DEVICE_V2_COMMAND_OUTCOME_UNKNOWN' });
    const commands = channel.published.filter(payload => {
      const frame = decodeFrame(payload);
      return frame.kind === Bbp2MessageKind.Route && decodeDeliveryBody(frame.body).messageKind === Bbp2MessageKind.Command;
    });
    expect(commands).toHaveLength(failure === 'timeout' ? 2 : 1);
    expect(new Set(commands.map(bytesToHex)).size).toBe(1);
    await session.close();
  });

  it('notifies session retirement before Store listeners can enqueue another read', async () => {
    const channel = new FakeChannel(); installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.ensureReady(logicalDeviceId);
    const states: string[] = [];
    const stop = session.store.subscribe(() => states.push(session.state));
    const count = channel.published.length;
    await session.close();
    expect(states).toEqual(['closed']);
    expect(channel.published).toHaveLength(count);
    stop();
  });

  it.each([Bbp2MessageKind.StatePage, Bbp2MessageKind.Patch] as const)(
    'does not let unsolicited kind %s overwrite a solicited State transfer', async kind => {
      const channel = new FakeChannel(); installServer(channel);
      const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
      await session.start(); await session.ensureReady(logicalDeviceId);
      const respond = channel.responder!;
      channel.responder = payload => {
        const frame = decodeFrame(payload);
        if (decodeDeliveryBody(frame.body).messageKind === Bbp2MessageKind.StateRequest) {
          channel.emit(encodeFrame({ kind: Bbp2MessageKind.Delivery, flags: Bbp2FrameFlag.IsResponse, sequence: 401,
            body: notificationBody(kind, hexToBytes(kind === Bbp2MessageKind.StatePage
              ? 'a5000201000202030204a101f4' : 'a30000010202a101f4')) }));
        }
        return respond(payload);
      };
      await session.refresh(logicalDeviceId);
      expect(session.store.snapshot(logicalDeviceId)).toMatchObject({ stateFresh: true, stateRevision: 2 });
      expect(session.state).toBe('ready');
      await session.close();
    },
  );

  it.each([false, true])('newer notifications use at most two read-only snapshots, continuous changes=%s', async continuous => {
    const channel = new FakeChannel(), server = installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.ensureReady(logicalDeviceId);
    const respond = channel.responder!;
    let reads = 0;
    channel.responder = payload => {
      const frame = decodeFrame(payload);
      if (decodeDeliveryBody(frame.body).messageKind === Bbp2MessageKind.StateRequest) {
        ++reads;
        if (reads === 1 || continuous) channel.emit(encodeFrame({ kind: Bbp2MessageKind.Delivery,
          flags: Bbp2FrameFlag.IsResponse, sequence: 400 + reads,
          body: notificationBody(Bbp2MessageKind.Patch, hexToBytes('a30000010302a101f5')) }));
        if (reads === 2 && !continuous) server.stateBody(hexToBytes('a5000301000202030204a101f5'));
      }
      return respond(payload);
    };
    if (continuous) {
      await expect(session.refresh(logicalDeviceId)).rejects.toMatchObject({ code: Bbp2ErrorCode.StateConflict });
      expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    } else {
      await session.refresh(logicalDeviceId);
      expect(session.store.snapshot(logicalDeviceId)).toMatchObject({ stateRevision: 3, stateFresh: true });
    }
    expect(reads).toBe(2);
    expect(session.state).toBe('ready');
    await session.close();
  });

  it('offline refresh preserves the entire cached snapshot and sends nothing', async () => {
    const channel = new FakeChannel();
    installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    await session.ensureReady(logicalDeviceId);
    session.store.applyPresence(logicalDeviceId, { cloudReachable: false, cloudLastSeenAt: 100 });
    const snapshot = session.store.snapshot(logicalDeviceId), count = channel.published.length;
    await expect(session.refresh(logicalDeviceId)).rejects.toMatchObject({ code: 'DEVICE_V2_TARGET_UNREACHABLE' });
    expect(session.store.snapshot(logicalDeviceId)).toEqual(snapshot);
    expect(channel.published).toHaveLength(count);
    await session.close();
  });

  it('does not reconnect the account channel when an offline target needs State resync', async () => {
    const channel = new FakeChannel();
    installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    const errors = vi.fn();
    session.subscribeErrors(errors);
    await session.start();
    await session.ensureReady(logicalDeviceId);
    session.store.applyPresence(logicalDeviceId, { cloudReachable: false, cloudLastSeenAt: 100 });
    const count = channel.published.length;
    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 201,
      body: notificationBody(Bbp2MessageKind.Patch, hexToBytes('a30000010402a101f5')),
    }));
    await Promise.resolve();
    expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    expect(channel.published).toHaveLength(count);
    expect(errors).not.toHaveBeenCalled();
    expect(session.state).toBe('ready');
    session.store.applyPresence(logicalDeviceId, { cloudReachable: true, cloudLastSeenAt: 101 });
    await session.ensureReady(logicalDeviceId);
    expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(true);
    await session.close();
  });

  it('known offline presence prevents cached readiness and new Commands without discarding the page', async () => {
    const channel = new FakeChannel();
    installServer(channel, { presence: true });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.ensureReady(logicalDeviceId);
    await session.subscribePresence(logicalDeviceId); // Authority reports offline.
    const cached = session.store.snapshot(logicalDeviceId), count = channel.published.length;
    await expect(session.ensureReady(logicalDeviceId)).rejects.toMatchObject({ code: 'DEVICE_V2_TARGET_UNREACHABLE' });
    await expect(session.command(logicalDeviceId, 'power', true)).rejects.toMatchObject({ code: 'DEVICE_V2_TARGET_UNREACHABLE' });
    expect(channel.published).toHaveLength(count);
    expect(session.store.snapshot(logicalDeviceId).manifest).toEqual(cached.manifest);
    expect(session.store.snapshot(logicalDeviceId).values).toEqual(cached.values);
    session.store.applyPresence(logicalDeviceId, { cloudReachable: true, cloudLastSeenAt: 100 });
    await expect(session.command(logicalDeviceId, 'power', true)).resolves.toBeDefined();
    await session.close();
  });

  it('rechecks reachability after readiness await, before allocating/publishing a Command', async () => {
    const channel = new FakeChannel(); installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.ensureReady(logicalDeviceId);
    session.store.applyPresence(logicalDeviceId, { cloudReachable: true, cloudLastSeenAt: 100 });
    const count = channel.published.length, pending = session.command(logicalDeviceId, 'power', true);
    session.store.applyPresence(logicalDeviceId, { cloudReachable: false, cloudLastSeenAt: 101 });
    await expect(pending).rejects.toMatchObject({ code: 'DEVICE_V2_TARGET_UNREACHABLE' });
    expect(channel.published).toHaveLength(count); await session.close();
  });

  it('offline during a read-only synchronization cannot complete ensureReady successfully', async () => {
    const channel = new FakeChannel(); installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    const respond = channel.responder!;
    channel.responder = payload => {
      const packet = decodeFrame(payload);
      if (packet.kind === Bbp2MessageKind.Route && decodeDeliveryBody(packet.body).messageKind === Bbp2MessageKind.StateRequest) {
        session.store.applyPresence(logicalDeviceId, { cloudReachable: false, cloudLastSeenAt: 101 });
      }
      return respond(payload);
    };
    await session.start();
    await expect(session.ensureReady(logicalDeviceId)).rejects.toMatchObject({ code: 'DEVICE_V2_TARGET_UNREACHABLE' });
    await session.close();
  });

  it('offline after publication does not relabel an in-flight Command as not sent', async () => {
    const channel = new FakeChannel(); installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.ensureReady(logicalDeviceId);
    const respond = channel.responder!;
    channel.responder = payload => {
      if (decodeDeliveryBody(decodeFrame(payload).body).messageKind === Bbp2MessageKind.Command) {
        session.store.applyPresence(logicalDeviceId, { cloudReachable: false, cloudLastSeenAt: 101 });
      }
      return respond(payload);
    };
    await expect(session.command(logicalDeviceId, 'power', true)).resolves.toBeDefined();
    await session.close();
  });

  it('negotiates once, synchronizes a target, commands, and keeps Event separate from State', async () => {
    const channel = new FakeChannel();
    const server = installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    const events = vi.fn();
    session.store.subscribeEvents(events);

    await session.start();
    expect(session.state).toBe('ready');
    await session.ensureReady(logicalDeviceId);
    expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(2);
    expect(session.store.snapshot(logicalDeviceId).values['power']?.value).toBe(false);

    await expect(session.command(logicalDeviceId, 'power', true)).resolves.toMatchObject({
      acknowledgedSequence: 5,
    });
    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 201,
      body: notificationBody(Bbp2MessageKind.Patch, hexToBytes('a30000010302a101f5')),
    }));
    expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(3);
    expect(session.store.snapshot(logicalDeviceId).values['power']?.value).toBe(true);

    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 202,
      body: notificationBody(Bbp2MessageKind.Event, hexToBytes('a102f5')),
    }));
    expect(events).toHaveBeenCalledOnce();
    expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(3);

    server.stateBody(hexToBytes('a5000501000202030204a101f5'));
    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 203,
      body: notificationBody(Bbp2MessageKind.Patch, hexToBytes('a30000010502a101f4')),
    }));
    await vi.waitFor(() => expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(5));
    expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(true);

    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 204,
      body: notificationBody(
        Bbp2MessageKind.StatePage,
        hexToBytes('a5000001000202030204a101f5'),
      ),
    }));
    expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(0);
    expect(session.store.snapshot(logicalDeviceId).values['power']?.value).toBe(true);

    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 205,
      body: notificationBody(Bbp2MessageKind.Patch, hexToBytes('a30000010102a101f4')),
    }));
    expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(1);
    expect(session.store.snapshot(logicalDeviceId).values['power']?.value).toBe(false);

    await session.close();
    expect(session.state).toBe('closed');
    expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    expect(session.store.snapshot(logicalDeviceId).eventInterrupted).toBe(true);
  });

  it('keeps unsolicited notifications on the routed ble_ logical identity', async () => {
    const channel = new FakeChannel();
    installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });

    await session.start();
    await session.ensureReady(bleLogicalDeviceId);
    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 201,
      body: notificationBody(
        Bbp2MessageKind.Patch,
        hexToBytes('a30000010302a101f5'),
        bleLogicalDeviceId,
      ),
    }));

    expect(session.store.snapshot(bleLogicalDeviceId).stateRevision).toBe(3);
    expect(session.store.snapshot(bleLogicalDeviceId).values['power']?.value).toBe(true);
    expect(session.store.snapshot(logicalDeviceId).stateRevision).toBeNull();
    await expect(session.ensureReady(logicalDeviceId)).rejects.toThrow(/ambiguous/);
  });

  it('keeps the account and other targets ready while a lost watch recovers; old loss cannot retire its replacement', async () => {
    vi.useFakeTimers();
    const channel = new FakeChannel(); installServer(channel, { presenceRecovery: true });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    const other = 'device_22222222-2222-4333-8444-555555555555';
    try {
      await session.start(); await session.ensureReady(logicalDeviceId); await session.ensureReady(other);
      await session.subscribePresence(logicalDeviceId); await session.subscribePresence(other);
      session.store.applyPresence(other, { cloudReachable: true, cloudLastSeenAt: 100 });
      const request = channel.published.map(decodeFrame).filter(f => f.kind === Bbp2MessageKind.Route)
        .map(f => decodeDeliveryBody(f.body)).find(r => r.messageKind === Bbp2MessageKind.PresenceControl)!;
      const loss = encodeFrame({ kind: Bbp2MessageKind.Delivery, flags: 2, sequence: 201,
        body: encodeDeliveryBody({ peerKind: 0, peerId: request.peerId, messageKind: Bbp2MessageKind.PresenceLost,
          messageFlags: 0, messageBody: concat(Uint8Array.of(0xa1, 0, 0x50), request.requestId!) }) });
      channel.emit(loss);
      expect(session.state).toBe('ready');
      expect(session.store.snapshot(logicalDeviceId)).toMatchObject({ cloudReachable: null, cloudPresenceLost: true,
        manifestAccepted: false, stateFresh: false });
      expect(session.store.snapshot(other).manifestAccepted).toBe(true);
      await expect(session.command(other, 'power', true)).resolves.toBeDefined();
      await expect(session.command(logicalDeviceId, 'power', true)).rejects.toThrow(/unreachable/);
      // An HTTP inventory cache must not undo a live watch-loss fence.
      session.store.applyPresence(logicalDeviceId, { cloudReachable: true, cloudLastSeenAt: 100 });
      expect(session.store.snapshot(logicalDeviceId).cloudReachable).toBeNull();
      await vi.advanceTimersByTimeAsync(1001);
      expect(session.store.snapshot(logicalDeviceId).cloudPresenceLost).toBeUndefined();
      expect(session.store.snapshot(logicalDeviceId).cloudReachable).toBe(false);
      channel.emit(loss);
      expect(session.store.snapshot(logicalDeviceId).cloudPresenceLost).toBeUndefined();
      expect(session.state).toBe('ready');
    } finally { await session.close(); vi.useRealTimers(); }
  });

  it('rejects unnegotiated PresenceLost instead of accepting an invented offline state', async () => {
    const channel = new FakeChannel(); installServer(channel, { presence: true });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start(); await session.subscribePresence(logicalDeviceId);
    channel.emit(encodeFrame({ kind: Bbp2MessageKind.Delivery, flags: 2, sequence: 201,
      body: encodeDeliveryBody({ peerKind: 0, peerId: logicalDevicePeerId(logicalDeviceId), messageKind: Bbp2MessageKind.PresenceLost,
        messageFlags: 0, messageBody: hexToBytes('a1005011111111111111111111111111111111') }) }));
    expect(session.state).toBe('closed'); await session.close();
  });

  it('subscribes and receives Presence without downloading Manifest or State', async () => {
    const channel = new FakeChannel();
    const server = installServer(channel, { presence: true });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });

    await session.start();
    await expect(session.subscribePresence(logicalDeviceId)).resolves.toBe(true);
    expect(session.store.snapshot(logicalDeviceId)).toMatchObject({
      manifest: null,
      stateFresh: false,
      cloudReachable: false,
      cloudLastSeenAt: null,
    });
    expect(server.manifestRequestCount()).toBe(0);

    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Delivery,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 201,
      body: presenceNotificationBody(hexToBytes('a200f5011b0000018bcfe56800')),
    }));
    expect(session.store.snapshot(logicalDeviceId)).toMatchObject({
      cloudReachable: true,
      cloudLastSeenAt: 1_700_000_000_000,
    });
    await session.close();
  });

  it('retransmits the exact Route frame once when a response is lost', async () => {
    const channel = new FakeChannel();
    installServer(channel, { dropFirstManifest: true });
    const session = new DeviceV2Session(channel, undefined, {
      requestId: requestIds(),
      requestTimeoutMs: 5,
      routeRetries: 1,
    });
    await session.start();
    await session.ensureReady(logicalDeviceId);

    const requests = channel.published.filter(payload => {
      const frame = decodeFrame(payload);
      return frame.kind === Bbp2MessageKind.Route
        && decodeDeliveryBody(frame.body).messageKind === Bbp2MessageKind.ManifestRequest;
    });
    expect(requests).toHaveLength(2);
    expect(bytesToHex(requests[0]!)).toBe(bytesToHex(requests[1]!));
    await session.close();
  });

  it.each([Bbp2ErrorCode.CommandRejected, Bbp2ErrorCode.RateLimited])(
    'exposes typed wire error %s without retrying a rejected command',
    async code => {
      const channel = new FakeChannel();
      installServer(channel, { commandError: code });
      const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
      await session.start();
      await session.ensureReady(logicalDeviceId);

      const error = await session.command(logicalDeviceId, 'power', true).catch(reason => reason);
      expect(error).toBeInstanceOf(DeviceV2RouteError);
      expect((error as DeviceV2RouteError).code).toBe(code);
      await session.close();
    },
  );

  it('rejects only the pending Route for a top-level Error and keeps the session ready', async () => {
    const channel = new FakeChannel();
    installServer(channel, {
      commandError: Bbp2ErrorCode.RateLimited,
      topLevelCommandError: true,
    });
    const session = new DeviceV2Session(channel, undefined, {
      requestId: requestIds(),
      requestTimeoutMs: 5,
      routeRetries: 1,
    });
    await session.start();
    await session.ensureReady(logicalDeviceId);

    const error = await session.command(logicalDeviceId, 'power', true).catch(reason => reason);
    expect(error).toBeInstanceOf(DeviceV2RouteError);
    expect((error as DeviceV2RouteError).code).toBe(Bbp2ErrorCode.RateLimited);
    expect(session.state).toBe('ready');

    const commands = channel.published.filter(payload => {
      const frame = decodeFrame(payload);
      return frame.kind === Bbp2MessageKind.Route
        && decodeDeliveryBody(frame.body).messageKind === Bbp2MessageKind.Command;
    });
    expect(commands).toHaveLength(1);
    await session.close();
  });

  it('ignores a late top-level Error without a pending Route', async () => {
    const channel = new FakeChannel();
    installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();

    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Error,
      flags: Bbp2FrameFlag.IsResponse,
      sequence: 201,
      body: errorBody(Bbp2ErrorCode.RateLimited, 0x7fff),
    }));

    expect(session.state).toBe('ready');
    await session.close();
  });

  it('closes the session for invalid top-level Error metadata', async () => {
    const channel = new FakeChannel();
    installServer(channel);
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();

    channel.emit(encodeFrame({
      kind: Bbp2MessageKind.Error,
      flags: 0,
      sequence: 201,
      body: errorBody(Bbp2ErrorCode.RateLimited, 1),
    }));

    expect(session.state).toBe('closed');
  });
});
