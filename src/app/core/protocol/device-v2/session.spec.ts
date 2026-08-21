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
const manifestPage = hexToBytes(
  'a600010158204c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf0200030204020582a50065706f7765720100020003030401a50065616c61726d0102020003080402',
);
const serverHello = hexToBytes('a60002018102021904c303190200041902000904');

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
  messageKind: Bbp2MessageKind.Patch | Bbp2MessageKind.Event,
  messageBody: Uint8Array,
): Uint8Array {
  return encodeDeliveryBody({
    peerKind: Bbp2RoutePeerKind.LogicalDevice,
    peerId: logicalDevicePeerId(logicalDeviceId),
    messageKind,
    messageFlags: Bbp2FrameFlag.IdMode,
    messageBody,
  });
}

function requestIds(): () => Uint8Array {
  let value = 0;
  return () => new Uint8Array(16).fill(++value);
}

function installServer(
  channel: FakeChannel,
  options: { dropFirstManifest?: boolean; rejectCommands?: boolean } = {},
): { stateBody: (body: Uint8Array) => void } {
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
        body: serverHello,
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
    if (request.messageKind === Bbp2MessageKind.ManifestRequest) {
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
      if (options.rejectCommands) {
        respond(
          request,
          Bbp2MessageKind.Error,
          Bbp2FrameFlag.IsResponse,
          errorBody(Bbp2ErrorCode.CommandRejected, frame.sequence),
        );
      } else {
        respond(request, Bbp2MessageKind.Ack, Bbp2FrameFlag.IsResponse, ackBody(frame.sequence));
      }
    }
  };
  return { stateBody: body => { state = body; } };
}

describe('DeviceV2Session', () => {
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

    await session.close();
    expect(session.state).toBe('closed');
    expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    expect(session.store.snapshot(logicalDeviceId).eventInterrupted).toBe(true);
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

  it('exposes a typed wire error without retrying a rejected command', async () => {
    const channel = new FakeChannel();
    installServer(channel, { rejectCommands: true });
    const session = new DeviceV2Session(channel, undefined, { requestId: requestIds() });
    await session.start();
    await session.ensureReady(logicalDeviceId);

    const error = await session.command(logicalDeviceId, 'power', true).catch(reason => reason);
    expect(error).toBeInstanceOf(DeviceV2RouteError);
    expect((error as DeviceV2RouteError).code).toBe(Bbp2ErrorCode.CommandRejected);
    await session.close();
  });
});
