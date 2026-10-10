import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bbp2Frame, Bbp2FrameFlag as Flag, Bbp2MessageKind as Kind,
  decodeFrame, encodeFrame, encodeAckBody, encodeCanonicalArray as array,
  encodeCanonicalMap as map, encodeCanonicalUnsigned as uint, hexToBytes,
  BBP2_FEATURE_TIME_SYNC, encodeTimeRequest, decodeTimeResponse } from '../../protocol/device-v2';
import { decodeDirectDeviceHelloBody, encodeDirectAppHelloBody } from '../../protocol/device-v2/direct-hello';
import { DirectDeviceSession } from '../../protocol/device-v2/direct-session';
import { LocalAccessAuthorization, SelfLocalAccessRequest } from './client';
import { openLocalDeviceSession } from './session';

const manifest = hexToBytes('a600010158204c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf0200030204020582a50065706f7765720100020003030401a50065616c61726d0102020003080402');
const state = hexToBytes('a5000201000202030204a101f4');
const logicalDeviceId = 'device_01234567-89ab-cdef-0123-456789abcdef';
const request: SelfLocalAccessRequest = { securityProfile: 1, recipientLogicalDeviceId: logicalDeviceId, targetLogicalDeviceId: '',
  targetDeviceInstanceId: new Uint8Array(16).fill(1), callerSessionId: new Uint8Array(16).fill(2),
  requestId: new Uint8Array(16).fill(3), accessEpoch: 0, topologyVersion: 0, permissions: 3, lifetimeMillis: 60000 };
function hello({ role = 0, features = 0xc3, size = 256, window = 1, methods = false } = {}) {
  const fields: Array<[number, Uint8Array]> = [[0, uint(role)], [1, array([uint(2)])],
    [2, uint(features)], [3, uint(size)], [4, uint(size)]];
  if (methods) fields.push([8, array([uint(2)])]);
  fields.push([9, uint(window)]);
  return map(fields);
}

class FakeSecureClient {
  readonly maxFrameSize = 400;
  authenticated = false;
  closed = false;
  sent: Bbp2Frame[] = [];
  private inbox: Uint8Array[] = [];
  private waiter?: { resolve: (value: Uint8Array) => void; reject: (error: Error) => void };
  beforeSend?: (frame: Bbp2Frame) => Promise<void>;
  helloBody = hello();
  permissions = 3;
  open = vi.fn(async (): Promise<LocalAccessAuthorization> => {
    this.authenticated = true; return Object.freeze({ permissions: this.permissions });
  });
  respond: (frame: Bbp2Frame) => void = frame => {
    if (frame.kind === Kind.Hello) this.reply(frame, Kind.Hello, this.helloBody);
    else if (frame.kind === Kind.ManifestRequest) this.reply(frame, Kind.Manifest, manifest);
    else if (frame.kind === Kind.ManifestAccept || frame.kind === Kind.Command)
      this.reply(frame, Kind.Ack, encodeAckBody(frame.sequence, 2));
    else if (frame.kind === Kind.StateRequest) this.reply(frame, Kind.StatePage, state, Flag.IsResponse | Flag.IdMode);
  };
  async send(bytes: Uint8Array): Promise<void> {
    expect(this.authenticated).toBe(true);
    if (this.closed) throw new Error('closed');
    const frame = decodeFrame(bytes);
    this.sent.push(frame);
    await this.beforeSend?.(frame);
    this.respond(frame);
  }
  receive(): Promise<Uint8Array> {
    if (this.closed) return Promise.reject(new Error('closed'));
    const first = this.inbox.shift();
    if (first) return Promise.resolve(first);
    expect(this.waiter).toBeUndefined();
    return new Promise((resolve, reject) => { this.waiter = { resolve, reject }; });
  }
  reply(frame: Bbp2Frame, kind: Kind, body: Uint8Array, flags = Flag.IsResponse): void {
    this.emit(encodeFrame({ kind, body, flags, sequence: frame.sequence }));
  }
  emit(bytes: Uint8Array): void {
    if (this.waiter) { const waiter = this.waiter; this.waiter = undefined; waiter.resolve(bytes); }
    else this.inbox.push(bytes);
  }
  close = vi.fn(async () => {
    this.closed = true; this.inbox = [];
    this.waiter?.reject(new Error('closed')); this.waiter = undefined;
  });
}

afterEach(() => vi.useRealTimers());

describe('transport-authenticated LAN self BBP session (fake secure byte port)', () => {
  it.each([
    { permissions: 1, features: 0xc3 | BBP2_FEATURE_TIME_SYNC, replies: false },
    { permissions: 3, features: 0xc3 | BBP2_FEATURE_TIME_SYNC, replies: true },
    { permissions: 3, features: 0xc3, replies: false },
  ])('responds to time only from granted Control and negotiated capability: %j', async test => {
    const client = new FakeSecureClient(); client.permissions = test.permissions;
    client.helloBody = hello({ features: test.features });
    const session = await openLocalDeviceSession(client,
      { ...request, permissions: test.permissions === 1 ? 3 : 1 }, new AbortController().signal);
    try {
      const nonce = new Uint8Array(16).fill(7), before = Date.now();
      client.emit(encodeFrame({ kind: Kind.TimeRequest, sequence: 51, flags: 0, body: encodeTimeRequest(nonce) }));
      await session.refresh(); // Barrier after the request; state remains usable even for Observer/old peers.
      const replies = client.sent.filter(frame => frame.kind === Kind.TimeResponse);
      expect(replies).toHaveLength(test.replies ? 1 : 0);
      if (test.replies) {
        expect(replies[0]).toMatchObject({ sequence: 51, flags: Flag.IsResponse });
        expect(encodeFrame(replies[0]!)).toHaveLength(40);
        const sample = decodeTimeResponse(replies[0]!.body);
        expect(sample.nonce).toEqual(nonce);
        expect(sample.utcAtReplyMillis).toBeGreaterThanOrEqual(before);
        expect(sample.utcAtReplyMillis).toBeLessThanOrEqual(Date.now());
      }
      expect(session.state).toBe('ready');
    } finally { await session.close(); }
  });

  it('queues a time response on the existing writer while a same-sequence business ACK remains independent', async () => {
    const client = new FakeSecureClient(); client.helloBody = hello({ features: 0xc3 | BBP2_FEATURE_TIME_SYNC });
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    let release!: () => void;
    client.beforeSend = frame => {
      if (frame.kind !== Kind.Command) return Promise.resolve();
      client.emit(encodeFrame({ kind: Kind.TimeRequest, sequence: frame.sequence,
        flags: 0, body: encodeTimeRequest(new Uint8Array(16).fill(4)) }));
      return new Promise<void>(resolve => { release = resolve; });
    };
    try {
      const command = session.command('power', true);
      await vi.waitFor(() => expect(release).toBeDefined());
      expect(client.sent.at(-1)!.kind).toBe(Kind.Command);
      release(); await expect(command).resolves.toMatchObject({ stateRevision: 2 });
      await session.refresh();
      const reply = client.sent.find(frame => frame.kind === Kind.TimeResponse)!;
      expect(reply.sequence).toBe(client.sent.find(frame => frame.kind === Kind.Command)!.sequence);
      expect(client.sent.filter(frame => frame.kind === Kind.TimeResponse)).toHaveLength(1);
      expect(session.state).toBe('ready'); expect(client.open).toHaveBeenCalledOnce();
    } finally { await session.close(); }
  });

  it('does not reply to a late time request after the page/account/revocation owner closes the lane', async () => {
    const client = new FakeSecureClient(), owner = new AbortController();
    client.helloBody = hello({ features: 0xc3 | BBP2_FEATURE_TIME_SYNC });
    const session = await openLocalDeviceSession(client, request, owner.signal);
    const sends = client.sent.length;
    // Resolve the pending byte read, then cancel before its continuation runs.
    client.emit(encodeFrame({ kind: Kind.TimeRequest, sequence: 71, flags: 0,
      body: encodeTimeRequest(new Uint8Array(16).fill(6)) }));
    owner.abort(); await session.close();
    expect(client.sent).toHaveLength(sends);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('keeps failed native cleanup observable and never announces physical release', async () => {
    const client = new FakeSecureClient();
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    const cleanup = client.close.getMockImplementation()!;
    client.close.mockImplementation(async () => { await cleanup(); throw new Error('NATIVE_CLOSE_FAILED'); });
    const released = vi.fn(); session.subscribeClosed(released);
    await expect(session.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    session.subscribeClosed(released);
    await expect(session.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    expect(released).not.toHaveBeenCalled(); expect(client.close).toHaveBeenCalledOnce();
  });

  it('never promotes a forged Manifest even after a valid Hello', async () => {
    const client = new FakeSecureClient(), respond = client.respond;
    client.respond = frame => {
      if (frame.kind !== Kind.ManifestRequest) { respond(frame); return; }
      const corrupted = manifest.slice(); corrupted[7] = corrupted[7]! ^ 1;
      client.reply(frame, Kind.Manifest, corrupted);
    };
    await expect(openLocalDeviceSession(client, request, new AbortController().signal)).rejects.toThrow();
    expect(client.sent.map(frame => frame.kind)).toEqual([Kind.Hello, Kind.ManifestRequest]);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('uses device Hello after secure open; no broker Route or BLE Method 2; returns verified Manifest and State', async () => {
    const client = new FakeSecureClient();
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    try {
      expect(session).toBeInstanceOf(DirectDeviceSession);
      expect(client.sent.map(frame => frame.kind)).toEqual([Kind.Hello, Kind.ManifestRequest, Kind.ManifestAccept, Kind.StateRequest]);
      expect(client.sent[0]!.body).toEqual(encodeDirectAppHelloBody('transport', 400, true));
      expect(session.store.snapshot(logicalDeviceId)).toMatchObject({ manifestAccepted: true, stateFresh: true });
      await expect(session.command('power', true)).resolves.toMatchObject({ stateRevision: 2 });
      expect(client.sent.at(-1)!.flags).toBe(Flag.AckRequired | Flag.IdMode);
      expect(client.sent.every(frame => encodeFrame(frame).length <= 256)).toBe(true);
    } finally { await session.close(); }
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('does not downgrade BLE authentication while permitting pre-authenticated transport Hello', () => {
    expect(() => decodeDirectDeviceHelloBody(hello(), 'controller')).toThrow();
    expect(decodeDirectDeviceHelloBody(hello(), 'transport').maxFrameSize).toBe(256);
    expect(decodeDirectDeviceHelloBody(hello({ features: 0x22e3, methods: true }), 'controller').features).toBe(0x22e3);
    // Existing BLE canonical bytes stay unchanged, including Method 2 and window 4.
    expect(encodeDirectAppHelloBody('controller')).toEqual(hexToBytes('a70001018102021922e303190200041902000881020904'));
  });

  it.each([hello({ role: 2 }), hello({ features: 3 }), hello({ window: 0 }), hello({ size: 9 })])(
    'rejects incompatible peer Hello before requesting a Manifest', async body => {
      const client = new FakeSecureClient(); client.helloBody = body;
      await expect(openLocalDeviceSession(client, request, new AbortController().signal)).rejects.toThrow();
      expect(client.sent).toHaveLength(1); expect(client.close).toHaveBeenCalledOnce();
    });

  it('rejects wrong response sequence and closes instead of promoting LAN', async () => {
    const client = new FakeSecureClient();
    client.respond = frame => client.reply({ ...frame, sequence: frame.sequence + 1 }, Kind.Hello, hello());
    await expect(openLocalDeviceSession(client, request, new AbortController().signal)).rejects.toThrow('LOCAL_ACCESS_HELLO_MISMATCH');
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('enforces the negotiated size, not merely the 400-byte transport maximum', async () => {
    const client = new FakeSecureClient();
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    client.emit(encodeFrame({ kind: Kind.Event, sequence: 8, flags: 0, body: new Uint8Array(247) }));
    await vi.waitFor(() => expect(session.state).toBe('closed'));
    await expect(session.command('power', true)).rejects.toThrow('LOCAL_ACCESS_FRAME_TOO_LARGE');
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('does not send a Hello from a late secure open after its page/account owner exits', async () => {
    const client = new FakeSecureClient(), owner = new AbortController();
    let release!: () => void;
    client.open.mockImplementation(() => new Promise<LocalAccessAuthorization>(resolve => {
      release = () => resolve({ permissions: 3 });
    }));
    const opening = openLocalDeviceSession(client, request, owner.signal);
    const failed = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    owner.abort(); release(); await failed;
    expect(client.sent).toEqual([]); expect(client.close).toHaveBeenCalledOnce();
  });

  it('closes an idle Hello by the bounded BBP preparation deadline', async () => {
    vi.useFakeTimers();
    const client = new FakeSecureClient(); client.respond = () => undefined;
    const opening = openLocalDeviceSession(client, request, new AbortController().signal);
    const failed = expect(opening).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15001); await failed;
    expect(client.sent).toHaveLength(1); expect(client.close).toHaveBeenCalledOnce();
  });

  it('retires the existing session on owner exit without any new secure open', async () => {
    const client = new FakeSecureClient(), owner = new AbortController();
    const session = await openLocalDeviceSession(client, request, owner.signal);
    owner.abort();
    await vi.waitFor(() => expect(session.state).toBe('closed'));
    await expect(session.command('power', true)).rejects.toThrow();
    expect(client.open).toHaveBeenCalledOnce(); expect(client.close).toHaveBeenCalledOnce();
  });

  it('serializes a reliable notification ACK behind an in-flight command without a second writer', async () => {
    const client = new FakeSecureClient();
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    let release!: () => void;
    client.beforeSend = frame => frame.kind === Kind.Command ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    const command = session.command('power', true);
    await vi.waitFor(() => expect(release).toBeDefined());
    client.emit(encodeFrame({ kind: Kind.Patch, sequence: 88, flags: Flag.IdMode | Flag.AckRequired,
      body: hexToBytes('a30000010302a101f5') }));
    await Promise.resolve(); await Promise.resolve();
    expect(client.sent.at(-1)!.kind).toBe(Kind.Command);
    release(); await command;
    await vi.waitFor(() => expect(client.sent.at(-1)!.kind).toBe(Kind.Ack));
    expect(session.state).toBe('ready'); await session.close();
  });

  it('reuses exact same command sequence/body for lost ACK, not a new Action or route', async () => {
    const client = new FakeSecureClient();
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    const respond = client.respond; let commands = 0;
    client.respond = frame => { if (frame.kind === Kind.Command && ++commands === 1) return; respond(frame); };
    vi.useFakeTimers();
    const command = session.command('power', true);
    await vi.advanceTimersByTimeAsync(1001); await command;
    const sent = client.sent.filter(frame => frame.kind === Kind.Command);
    expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]);
    await session.close();
  });

  it('an uncertain send failure closes with no automatic retry or replacement session', async () => {
    const client = new FakeSecureClient();
    const session = await openLocalDeviceSession(client, request, new AbortController().signal);
    client.beforeSend = async frame => { if (frame.kind === Kind.Command) throw new Error('UNCERTAIN_WRITE'); };
    await expect(session.command('power', true)).rejects.toThrow('UNCERTAIN_WRITE');
    expect(client.sent.filter(frame => frame.kind === Kind.Command)).toHaveLength(1);
    expect(client.open).toHaveBeenCalledOnce(); expect(client.close).toHaveBeenCalledOnce();
  });
});
