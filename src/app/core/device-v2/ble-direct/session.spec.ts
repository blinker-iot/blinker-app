import { describe, expect, it, vi } from 'vitest';

import {
  Bbp2ErrorCode,
  Bbp2Frame,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  decodeAckBody,
  encodeCanonicalArray,
  encodeCanonicalByteString,
  encodeCanonicalUnsigned,
  bytesToHex,
  hexToBytes,
  decodeManifestPageBody,
  DeviceV2Store,
} from '../../protocol/device-v2';
import { DirectDeviceFrameChannel, DirectDeviceProtocolError } from '../../protocol/device-v2/direct-session';
import { BleDirectSession } from './session';
import { BBP2_FEATURE_TIME_SYNC, encodeTimeRequest, decodeTimeResponse } from '../../protocol/device-v2/codec';
import {
  ControllerMutationOperation,
  encodeControllerMutationReceipt,
} from './wire';

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

class FakeDirectChannel implements DirectDeviceFrameChannel {
  readonly logicalDeviceId = logicalDeviceId;
  readonly sent: Bbp2Frame[] = [];
  responder?: (frame: Bbp2Frame) => void;
  beforeSend?: (frame: Bbp2Frame) => Promise<void>;

  private sequence = 3;
  private queued: Bbp2Frame[] = [];
  private waiting?: { resolve: (frame: Bbp2Frame) => void; reject: (error: Error) => void };

  createFrame(kind: Bbp2MessageKind, flags: number, body: Uint8Array): Bbp2Frame {
    this.sequence = this.sequence === 0xffff ? 1 : this.sequence + 1;
    return { kind, flags, sequence: this.sequence, body };
  }

  async send(frame: Bbp2Frame): Promise<void> {
    this.sent.push({ ...frame, body: new Uint8Array(frame.body) });
    await this.beforeSend?.(frame);
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

  failReceive(error: Error): void {
    this.waiting?.reject(error);
    this.waiting = undefined;
  }

  async close(): Promise<void> {
    this.queued = [];
    this.waiting?.reject(new Error('closed'));
    this.waiting = undefined;
  }
}

it('failed native cleanup never notifies release, including late subscribers and repeated close', async () => {
  const channel = new FakeDirectChannel(), original = channel.close.bind(channel);
  channel.close = vi.fn(async () => { await original(); throw Error('NATIVE_CLOSE_FAILED'); });
  const session = new BleDirectSession(channel), released = vi.fn();
  session.subscribeClosed(released);
  await expect(session.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
  session.subscribeClosed(released);
  await expect(session.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
  expect(released).not.toHaveBeenCalled(); expect(channel.close).toHaveBeenCalledOnce();
});

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

describe('Direct Manifest cache negotiation', () => {
  function fixture() {
    const page = decodeManifestPageBody(manifestPage);
    const manifest = { revision: page.revision, fingerprint: bytesToHex(page.fingerprint), fields: page.fields };
    const cache = { hello: { revision: manifest.revision, fingerprint: manifest.fingerprint }, load: vi.fn(() => manifest) };
    const channel = new FakeDirectChannel(); installDevice(channel);
    return { manifest, cache, channel };
  }

  it('skips download only after canonical verification, real ACK and a fresh State', async () => {
    const { manifest, cache, channel } = fixture();
    const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
    const respond = channel.responder!;
    channel.responder = frame => {
      const snapshot = session.store.snapshot(logicalDeviceId);
      if (frame.kind === Bbp2MessageKind.ManifestAccept) {
        expect(snapshot.manifestAccepted).toBe(false);
        expect(snapshot.stateFresh).toBe(false);
        manifest.fields[0].key = 'mutated-after-verification';
      }
      if (frame.kind === Bbp2MessageKind.StateRequest) {
        expect(snapshot.manifestAccepted).toBe(true); expect(snapshot.stateFresh).toBe(false);
      }
      respond(frame);
    };
    try {
      await session.command('power', true);
      expect(channel.sent.map(f => f.kind)).toEqual([
        Bbp2MessageKind.ManifestAccept, Bbp2MessageKind.StateRequest, Bbp2MessageKind.Command,
      ]);
      expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(true);
      expect(cache.load).toHaveBeenCalledOnce();
    } finally { await session.close(); }
  });

  it.each(['missing', 'revision', 'fingerprint', 'corrupt', 'invalid-id'])(
    'downloads normally for %s cache without accepting unverified fields', async fault => {
      const { manifest, cache, channel } = fixture();
      if (fault === 'missing') cache.load.mockReturnValue(undefined as any);
      if (fault === 'revision') cache.hello.revision++;
      if (fault === 'fingerprint') cache.hello.fingerprint = '00'.repeat(32);
      if (fault === 'corrupt') manifest.fields[0].key = 'forged';
      if (fault === 'invalid-id') manifest.fields[0].id = 2;
      const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
      try {
        await session.synchronize();
        expect(channel.sent.map(f => f.kind)).toEqual([
          Bbp2MessageKind.ManifestRequest, Bbp2MessageKind.ManifestAccept, Bbp2MessageKind.StateRequest,
        ]);
        expect(session.store.snapshot(logicalDeviceId).manifest?.fields[0].key).toBe('power');
      } finally { await session.close(); }
    },
  );

  it('discards a rejected candidate once, then downloads; it never sends a Command before State', async () => {
    const { cache, channel } = fixture(), respond = channel.responder!;
    let accepts = 0;
    channel.responder = frame => {
      if (frame.kind === Bbp2MessageKind.ManifestAccept && ++accepts === 1) {
        channel.emit({ kind: Bbp2MessageKind.Error, flags: Bbp2FrameFlag.IsResponse,
          sequence: 99, body: errorBody(Bbp2ErrorCode.ManifestConflict, frame.sequence) });
      } else respond(frame);
    };
    const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
    try {
      await session.command('power', true);
      expect(channel.sent.map(f => f.kind)).toEqual([
        Bbp2MessageKind.ManifestAccept, Bbp2MessageKind.ManifestRequest,
        Bbp2MessageKind.ManifestAccept, Bbp2MessageKind.StateRequest, Bbp2MessageKind.Command,
      ]);
      expect(cache.load).toHaveBeenCalledOnce();
    } finally { await session.close(); }
  });

  it('does not hide account changes as cache misses', async () => {
    const { cache, channel } = fixture(); cache.load.mockImplementation(() => { throw Error('ACCOUNT_CHANGED'); });
    const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
    try {
      await expect(session.synchronize()).rejects.toThrow('ACCOUNT_CHANGED');
      expect(channel.sent).toHaveLength(0);
    } finally { await session.close(); }
  });

  it.each([Bbp2ErrorCode.AuthenticationRequired, Bbp2ErrorCode.UnsupportedMessage])(
    'does not hide peer authorization/protocol rejection %s by downloading', async code => {
      const { cache, channel } = fixture();
      channel.responder = frame => channel.emit({ kind: Bbp2MessageKind.Error,
        flags: Bbp2FrameFlag.IsResponse, sequence: 99, body: errorBody(code, frame.sequence) });
      const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
      try {
        await expect(session.command('power', true)).rejects.toMatchObject({ code });
        expect(channel.sent.map(f => f.kind)).toEqual([Bbp2MessageKind.ManifestAccept]);
      } finally { await session.close(); }
    },
  );

  it('bounds repeated Manifest conflict without looping or replaying a command', async () => {
    const { cache, channel } = fixture(), respond = channel.responder!;
    channel.responder = frame => {
      if (frame.kind === Bbp2MessageKind.ManifestAccept) channel.emit({ kind: Bbp2MessageKind.Error,
        flags: Bbp2FrameFlag.IsResponse, sequence: 99, body: errorBody(Bbp2ErrorCode.ManifestConflict, frame.sequence) });
      else respond(frame);
    };
    const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
    try {
      await expect(session.command('power', true)).rejects.toMatchObject({ code: Bbp2ErrorCode.ManifestConflict });
      expect(channel.sent.map(f => f.kind)).toEqual([
        Bbp2MessageKind.ManifestAccept, Bbp2MessageKind.ManifestRequest, Bbp2MessageKind.ManifestAccept,
      ]);
      expect(cache.load).toHaveBeenCalledOnce();
    } finally { await session.close(); }
  });

  it('does not mark ready, download or send a command when the acceptance ACK is lost', async () => {
    const { cache, channel } = fixture(); channel.responder = undefined;
    const session = new BleDirectSession(channel, undefined, 10, undefined, cache);
    try {
      await expect(session.command('power', true)).rejects.toThrow();
      expect(channel.sent.map(f => f.kind)).toEqual([Bbp2MessageKind.ManifestAccept, Bbp2MessageKind.ManifestAccept]);
      expect(channel.sent[0].sequence).toBe(channel.sent[1].sequence);
      expect(session.store.snapshot(logicalDeviceId).manifestAccepted).toBe(false);
      expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    } finally { await session.close(); }
  });

  it('does not continue negotiation if closed while the cache digest is pending', async () => {
    const { cache, channel } = fixture();
    let finish!: (digest: Uint8Array) => void;
    const store = new DeviceV2Store(() => new Promise(resolve => { finish = resolve; }));
    const session = new BleDirectSession(channel, store, 100, undefined, cache);
    const result = session.synchronize();
    const failed = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(finish).toBeDefined());
    await session.close(); finish(hexToBytes(cache.hello.fingerprint));
    await failed;
    expect(channel.sent).toHaveLength(0);
    expect(store.snapshot(logicalDeviceId).manifestAccepted).toBe(false);
  });

  it('explicit refresh uses the full path rather than reusing the Hello hint', async () => {
    const { cache, channel } = fixture();
    const session = new BleDirectSession(channel, undefined, 100, undefined, cache);
    try {
      await session.refresh();
      expect(cache.load).not.toHaveBeenCalled();
      expect(channel.sent[0].kind).toBe(Bbp2MessageKind.ManifestRequest);
    } finally { await session.close(); }
  });
});

describe('BleDirectSession', () => {
  it('answers device time while an App command ACK is pending, without consuming that slot', async () => {
    const channel = new FakeDirectChannel(); installDevice(channel);
    const device = channel.responder!, nonce = new Uint8Array(16).fill(9);
    channel.responder = request => {
      if (request.kind === Bbp2MessageKind.Command) channel.emit({ kind: Bbp2MessageKind.TimeRequest,
        sequence: request.sequence, flags: 0, body: encodeTimeRequest(nonce) });
      device(request);
    };
    const session = new BleDirectSession(channel, undefined, 100, {
      permissions: 3, features: BBP2_FEATURE_TIME_SYNC, maxFrameSize: 512, utcNow: () => 1789260000000,
    });
    try {
      await session.command('power', true);
      const replies = channel.sent.filter(f => f.kind === Bbp2MessageKind.TimeResponse);
      expect(replies).toHaveLength(1); expect(decodeTimeResponse(replies[0].body).nonce).toEqual(nonce);
      expect(session.state).toBe('ready');
    } finally { await session.close(); }
  });
  it.each([undefined, 1])('does not respond when uninstalled or Observer (%s)', permissions => {
    const channel = new FakeDirectChannel();
    const session = new BleDirectSession(channel, undefined, 100, permissions === undefined ? undefined : {
      permissions, features: BBP2_FEATURE_TIME_SYNC, maxFrameSize: 512,
    });
    channel.emit({ kind: Bbp2MessageKind.TimeRequest, flags: 0, sequence: 5, body: encodeTimeRequest(new Uint8Array(16).fill(1)) });
    return Promise.resolve().then(async () => { expect(channel.sent).toHaveLength(0); expect(session.state).toBe('ready'); await session.close(); });
  });
  it('does not send a time response for a receive resolving after close', async () => {
    const channel = new FakeDirectChannel();
    const session = new BleDirectSession(channel, undefined, 100, { permissions: 3, features: BBP2_FEATURE_TIME_SYNC, maxFrameSize: 512 });
    channel.emit({ kind: Bbp2MessageKind.TimeRequest, flags: 0, sequence: 5, body: encodeTimeRequest(new Uint8Array(16).fill(1)) });
    await session.close(); expect(channel.sent).toHaveLength(0);
  });
  it('ignores the delayed duplicate ManifestAccept ACK while awaiting State', async () => {
    const channel = new FakeDirectChannel();
    installDevice(channel);
    const respond = channel.responder!;
    let acceptedSequence = 0;
    channel.responder = request => {
      if (request.kind === Bbp2MessageKind.ManifestAccept) acceptedSequence = request.sequence;
      if (request.kind === Bbp2MessageKind.StateRequest) {
        channel.emit({
          kind: Bbp2MessageKind.Ack,
          flags: Bbp2FrameFlag.IsResponse,
          sequence: 102, // Fresh secure record / device sequence, same ACK body.
          body: ackBody(acceptedSequence),
        });
      }
      respond(request);
    };
    const session = new BleDirectSession(channel, undefined, 100);
    try {
      await session.synchronize();
      expect(session.store.snapshot(logicalDeviceId).stateFresh).toBe(true);
      expect(session.state).toBe('ready');
      channel.emit({ kind: Bbp2MessageKind.Ack, flags: Bbp2FrameFlag.IsResponse,
        sequence: 103, body: ackBody(acceptedSequence) });
      // A duplicate with no pending request is harmless too.
      await expect(session.command('power', true)).resolves.toBeDefined();
      expect(session.state).toBe('ready');
    } finally { await session.close(); }
  });

  it.each(['changed-revision', 'wrong-flags', 'older', 'future'])(
    'still rejects a non-exact late ACK: %s', async variant => {
      const channel = new FakeDirectChannel();
      installDevice(channel);
      const session = new BleDirectSession(channel, undefined, 100);
      await session.synchronize();
      const accepted = channel.sent.find(frame => frame.kind === Bbp2MessageKind.ManifestAccept)!;
      let body = ackBody(accepted.sequence);
      if (variant === 'changed-revision') body = concat(Uint8Array.of(0xa2, 0),
        unsigned(accepted.sequence), Uint8Array.of(1, 3));
      if (variant === 'older') body = ackBody(accepted.sequence - 1);
      if (variant === 'future') body = ackBody(accepted.sequence + 1);
      channel.emit({ kind: Bbp2MessageKind.Ack, sequence: 102,
        flags: variant === 'wrong-flags' ? 0 : Bbp2FrameFlag.IsResponse, body });
      await vi.waitFor(() => expect(session.state).toBe('closed'));
      await session.close();
    },
  );

  it('notifies close observers once after transport cleanup', async () => {
    const channel = new FakeDirectChannel();
    const session = new BleDirectSession(channel, undefined, 100);
    const closed = vi.fn();
    session.subscribeClosed(closed);

    await session.close();
    await session.close();

    expect(closed).toHaveBeenCalledOnce();
  });

  it('preserves the transport failure that closed the session', async () => {
    const channel = new FakeDirectChannel();
    const session = new BleDirectSession(channel, undefined, 100);
    const failure = new Error('relay window expired');

    channel.failReceive(failure);
    await vi.waitFor(() => expect(session.state).toBe('closed'));

    await expect(session.synchronize()).rejects.toBe(failure);
  });

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
    expect(error).toBeInstanceOf(DirectDeviceProtocolError);
    expect((error as DirectDeviceProtocolError).code).toBe(Bbp2ErrorCode.CommandRejected);
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

  it('starts the response retry only after a slow transport send completes', async () => {
    const channel = new FakeDirectChannel();
    installDevice(channel);
    const session = new BleDirectSession(channel, undefined, 20);
    await session.synchronize();

    let releaseSend!: () => void;
    const sendCompleted = new Promise<void>(resolve => { releaseSend = resolve; });
    channel.beforeSend = frame => frame.kind === Bbp2MessageKind.Command
      ? sendCompleted
      : Promise.resolve();

    vi.useFakeTimers();
    try {
      const command = session.command('power', true);
      await vi.advanceTimersByTimeAsync(100);
      expect(channel.sent.filter(frame => frame.kind === Bbp2MessageKind.Command)).toHaveLength(1);

      releaseSend();
      await expect(command).resolves.toBeDefined();
      expect(channel.sent.filter(frame => frame.kind === Bbp2MessageKind.Command)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      await session.close();
    }
  });

  it('installs a PresenceKey and verifies the deterministic device receipt', async () => {
    const channel = new FakeDirectChannel();
    const receipt = hexToBytes(
      'a70001011a01020304020203030458205dfbabeedf318bf33c0927c43d7630f51b82f351740301354fa3d7fc51f0132e0501065820d18631e40b5b4856a7990551108e45e4a58caac16cd8579f3db3a05452331ea6',
    );
    channel.responder = request => {
      if (request.kind !== Bbp2MessageKind.PresenceKeyMutation) return;
      expect(bytesToHex(request.body)).toBe(
        'a50001011a010203040202030304500102030405060708090a0b0c0d0e0f10',
      );
      channel.emit({
        kind: Bbp2MessageKind.PresenceKeyReceipt,
        flags: Bbp2FrameFlag.IsResponse,
        sequence: request.sequence,
        body: receipt,
      });
    };
    const session = new BleDirectSession(channel, undefined, 100);
    const installed = await session.replacePresenceKey(
      0x01020304,
      2,
      3,
      Uint8Array.from({ length: 16 }, (_, index) => index + 1),
    );
    expect(installed.encoded).toEqual(receipt);
    expect(installed.presenceKeyVersion).toBe(3);
    await session.close();
  });

  it('opens an authenticated controller window and relays an exact mutation', async () => {
    const channel = new FakeDirectChannel();
    const nonce = new Uint8Array(16).fill(0x31);
    const receipt = encodeControllerMutationReceipt({
      operation: ControllerMutationOperation.Install,
      grantId: new Uint8Array(16).fill(0x32),
      deviceInstanceId: new Uint8Array(16).fill(0x33),
      accessEpoch: 7,
      controllerId: new Uint8Array(16).fill(0x34),
      credentialVersion: 2,
      permissions: 3,
      secretDigest: new Uint8Array(32).fill(0x35),
      proofKind: 1,
      proof: new Uint8Array(32).fill(0x36),
    });
    channel.responder = request => {
      if (request.kind === Bbp2MessageKind.ControllerControlOpen) {
        channel.emit({
          kind: Bbp2MessageKind.ControllerControlChallenge,
          flags: Bbp2FrameFlag.IsResponse,
          sequence: request.sequence,
          body: encodeCanonicalArray([
            encodeCanonicalUnsigned(1), encodeCanonicalByteString(nonce),
          ]),
        });
      } else if (request.kind === Bbp2MessageKind.ControllerMutation) {
        channel.emit({
          kind: Bbp2MessageKind.ControllerMutationReceipt,
          flags: Bbp2FrameFlag.IsResponse,
          sequence: request.sequence,
          body: receipt,
        });
      }
    };
    const session = new BleDirectSession(channel, undefined, 100);

    await expect(session.openControllerControl()).resolves.toEqual(nonce);
    const installed = await session.applyControllerMutation(
      Uint8Array.of(0x81), new Uint8Array(32).fill(0x41),
    );

    expect(installed.credentialVersion).toBe(2);
    expect(channel.sent.map(frame => frame.kind)).toEqual([
      Bbp2MessageKind.ControllerControlOpen,
      Bbp2MessageKind.ControllerMutation,
    ]);
    await session.close();
  });
});
