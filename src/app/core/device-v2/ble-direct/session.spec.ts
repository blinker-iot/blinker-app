import { describe, expect, it, vi } from 'vitest';

import {
  Bbp2ErrorCode,
  Bbp2Frame,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  decodeAckBody,
  hexToBytes,
} from '../../protocol/device-v2';
import { BleDirectFrameChannel } from './secure-channel';
import { BleDirectProtocolError, BleDirectSession } from './session';

const logicalDeviceId = 'device_01234567-89ab-cdef-0123-456789abcdef';
const manifestPage = hexToBytes(
  'a600010158204c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf0200030204020582a50065706f7765720100020003030401a50065616c61726d0102020003080402',
);
const statePage = hexToBytes('a5000201000202030204a101f4');

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

class FakeDirectChannel implements BleDirectFrameChannel {
  readonly logicalDeviceId = logicalDeviceId;
  readonly sent: Bbp2Frame[] = [];
  responder?: (frame: Bbp2Frame) => void;

  private sequence = 3;
  private queued: Bbp2Frame[] = [];
  private waiting?: { resolve: (frame: Bbp2Frame) => void; reject: (error: Error) => void };

  createFrame(kind: Bbp2MessageKind, flags: number, body: Uint8Array): Bbp2Frame {
    this.sequence = this.sequence === 0xffff ? 1 : this.sequence + 1;
    return { kind, flags, sequence: this.sequence, body };
  }

  async send(frame: Bbp2Frame): Promise<void> {
    this.sent.push({ ...frame, body: new Uint8Array(frame.body) });
    this.responder?.(frame);
  }

  receive(): Promise<Bbp2Frame> {
    const frame = this.queued.shift();
    if (frame) return Promise.resolve(frame);
    return new Promise((resolve, reject) => { this.waiting = { resolve, reject }; });
  }

  emit(frame: Bbp2Frame): void {
    const copy = { ...frame, body: new Uint8Array(frame.body) };
    if (this.waiting) {
      const waiting = this.waiting;
      this.waiting = undefined;
      waiting.resolve(copy);
    } else {
      this.queued.push(copy);
    }
  }

  async close(): Promise<void> {
    this.queued = [];
    this.waiting?.reject(new Error('closed'));
    this.waiting = undefined;
  }
}

function installDevice(channel: FakeDirectChannel, rejectCommands = false): void {
  let deviceSequence = 100;
  channel.responder = request => {
    if (request.kind === Bbp2MessageKind.ManifestRequest) {
      channel.emit({
        kind: Bbp2MessageKind.Manifest,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: request.sequence,
        body: manifestPage,
      });
    } else if (request.kind === Bbp2MessageKind.ManifestAccept) {
      channel.emit({
        kind: Bbp2MessageKind.Ack,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: ++deviceSequence,
        body: ackBody(request.sequence),
      });
    } else if (request.kind === Bbp2MessageKind.StateRequest) {
      channel.emit({
        kind: Bbp2MessageKind.StatePage,
        flags: Bbp2FrameFlag.IsResponse | Bbp2FrameFlag.IdMode,
        sequence: request.sequence,
        body: statePage,
      });
    } else if (request.kind === Bbp2MessageKind.Command) {
      channel.emit({
        kind: rejectCommands ? Bbp2MessageKind.Error : Bbp2MessageKind.Ack,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: ++deviceSequence,
        body: rejectCommands
          ? errorBody(Bbp2ErrorCode.CommandRejected, request.sequence)
          : ackBody(request.sequence),
      });
    }
  };
}

describe('BleDirectSession', () => {
  it('synchronizes, commands, applies reliable Patch, and acknowledges it', async () => {
    const channel = new FakeDirectChannel();
    installDevice(channel);
    const session = new BleDirectSession(channel, undefined, 100);

    await session.synchronize();
    expect(session.store.snapshot(logicalDeviceId)).toMatchObject({
      manifestAccepted: true,
      stateFresh: true,
      stateRevision: 2,
    });
    expect(session.store.snapshot(logicalDeviceId).values['power']?.value).toBe(false);
    await expect(session.command('power', true)).resolves.toMatchObject({
      acknowledgedSequence: 7,
    });

    channel.emit({
      kind: Bbp2MessageKind.Patch,
      flags: Bbp2FrameFlag.IdMode | Bbp2FrameFlag.AckRequired,
      sequence: 200,
      body: hexToBytes('a30000010302a101f5'),
    });
    await vi.waitFor(() => {
      expect(session.store.snapshot(logicalDeviceId).stateRevision).toBe(3);
    });
    const ack = channel.sent.find(frame => frame.kind === Bbp2MessageKind.Ack);
    expect(ack?.flags).toBe(Bbp2FrameFlag.IsResponse);
    expect(decodeAckBody(ack!.body)).toEqual({
      acknowledgedSequence: 200,
      stateRevision: 3,
    });
    await session.close();
  });

  it('keeps Event outside persistent State', async () => {
    const channel = new FakeDirectChannel();
    installDevice(channel);
    const session = new BleDirectSession(channel, undefined, 100);
    const events = vi.fn();
    session.store.subscribeEvents(events);
    await session.synchronize();

    channel.emit({
      kind: Bbp2MessageKind.Event,
      flags: Bbp2FrameFlag.IdMode,
      sequence: 201,
      body: hexToBytes('a102f5'),
    });
    await vi.waitFor(() => expect(events).toHaveBeenCalledOnce());
    expect(session.store.snapshot(logicalDeviceId).values).not.toHaveProperty('alarm');
    await session.close();
  });

  it('returns a typed request error without closing an authenticated session', async () => {
    const channel = new FakeDirectChannel();
    installDevice(channel, true);
    const session = new BleDirectSession(channel, undefined, 100);
    await session.synchronize();

    const error = await session.command('power', true).catch(reason => reason);
    expect(error).toBeInstanceOf(BleDirectProtocolError);
    expect((error as BleDirectProtocolError).code).toBe(Bbp2ErrorCode.CommandRejected);
    expect(session.state).toBe('ready');
    await session.close();
  });

  it('retries an AckRequired request with the same BBP/2 frame', async () => {
    const channel = new FakeDirectChannel();
    installDevice(channel);
    const respond = channel.responder!;
    let commandAttempts = 0;
    channel.responder = request => {
      if (request.kind === Bbp2MessageKind.Command && ++commandAttempts === 1) return;
      respond(request);
    };
    const session = new BleDirectSession(channel, undefined, 20);

    await session.synchronize();
    await expect(session.command('power', true)).resolves.toBeDefined();
    const commands = channel.sent.filter(frame => frame.kind === Bbp2MessageKind.Command);
    expect(commandAttempts).toBe(2);
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(session.state).toBe('ready');
    await session.close();
  });
});
