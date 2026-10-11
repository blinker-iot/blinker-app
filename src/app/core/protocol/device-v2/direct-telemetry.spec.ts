import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bbp2ErrorCode, Bbp2Frame, Bbp2FrameFlag, Bbp2MessageKind, DeviceV2EndpointKind,
  DeviceV2Manifest, DeviceV2TelemetryOperation, DeviceV2TelemetryStatusCode,
  DeviceV2ValueType } from './types';
import { BBP2_FEATURE_TIME_SYNC, bytesToHex, CborReader, decodeCachedManifest,
  encodeAckBody, encodeCanonicalArray, encodeCanonicalByteString, encodeCanonicalManifestPrefix, encodeCanonicalMap as map,
  encodeCanonicalUnsigned as uint, encodeTimeRequest } from './codec';
import { DIRECT_FEATURE_TELEMETRY } from './direct-hello';
import { DirectDeviceFrameChannel, DirectDeviceSession, DirectDeviceProtocolError } from './direct-session';
import { DeviceV2Store } from './store';

const id = 'device_01234567-89ab-cdef-0123-456789abcdef';
const flags = Bbp2FrameFlag;
const kind = Bbp2MessageKind;
const op = DeviceV2TelemetryOperation;
const code = DeviceV2TelemetryStatusCode;

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

async function verifiedPage(manifest: DeviceV2Manifest) {
  const page = decodeCachedManifest({ ...manifest, fingerprint: '00'.repeat(32) });
  const canonical = new Uint8Array(concat([
    encodeCanonicalManifestPrefix(manifest.revision, manifest.fields.length), ...page.encodedFields,
  ]));
  page.fingerprint = new Uint8Array(await crypto.subtle.digest('SHA-256', canonical.buffer));
  manifest.fingerprint = bytesToHex(page.fingerprint);
  return page;
}

type Control = { operation: DeviceV2TelemetryOperation; streamId: number; epoch: number;
  leaseMs: number; intervalMs: number; fieldIds: number[] };

function control(body: Uint8Array): Control {
  const reader = new CborReader(body), result: Control = {
    operation: op.Open, streamId: 0, epoch: 0, leaseMs: 0, intervalMs: 1000, fieldIds: [],
  };
  for (let count = reader.readMapSize(5); count > 0; count--) {
    const key = reader.readUnsigned(5);
    if (key === 5) {
      for (let size = reader.readArraySize(32); size > 0; size--) result.fieldIds.push(reader.readUnsigned());
    } else {
      const value = reader.readUnsigned();
      if (key === 0) result.operation = value;
      else if (key === 1) result.streamId = value;
      else if (key === 2) result.epoch = value;
      else if (key === 3) result.leaseMs = value;
      else result.intervalMs = value;
    }
  }
  reader.finish(); return result;
}

function status(streamId: number, epoch: number, value: DeviceV2TelemetryStatusCode, interval = 1000): Uint8Array {
  return map([[0, uint(streamId)], [1, uint(epoch)], [2, uint(value)], [3, uint(interval)],
    [4, uint(value === code.Closed || value === code.Expired ? 0 : 30000)]]);
}

class Channel implements DirectDeviceFrameChannel {
  readonly logicalDeviceId = id;
  readonly sent: Bbp2Frame[] = [];
  responder?: (frame: Bbp2Frame) => void;
  beforeSend?: (frame: Bbp2Frame) => Promise<void>;
  private sequence = 10;
  private queued: Bbp2Frame[] = [];
  private waiting?: { resolve(frame: Bbp2Frame): void; reject(error: Error): void };
  createFrame(messageKind: Bbp2MessageKind, metadata: number, body: Uint8Array): Bbp2Frame {
    return { kind: messageKind, flags: metadata, sequence: ++this.sequence, body };
  }
  async send(frame: Bbp2Frame): Promise<void> {
    this.sent.push(frame); await this.beforeSend?.(frame); this.responder?.(frame);
  }
  receive(): Promise<Bbp2Frame> {
    const frame = this.queued.shift();
    return frame ? Promise.resolve(frame) : new Promise((resolve, reject) => { this.waiting = { resolve, reject }; });
  }
  emit(frame: Bbp2Frame): void {
    if (!this.waiting) { this.queued.push(frame); return; }
    const waiting = this.waiting; this.waiting = undefined; waiting.resolve(frame);
  }
  fail(error: Error): void { this.waiting?.reject(error); this.waiting = undefined; }
  async close(): Promise<void> { this.fail(Error('closed')); this.queued = []; }
}

async function fixture(permissions = 3, features = DIRECT_FEATURE_TELEMETRY | BBP2_FEATURE_TIME_SYNC) {
  const manifest: DeviceV2Manifest = { revision: 1, fingerprint: '00'.repeat(32), fields: [
    { id: 1, key: 'power', kind: DeviceV2EndpointKind.Property, type: DeviceV2ValueType.Boolean, access: 3 },
    { id: 2, key: 'sample', kind: DeviceV2EndpointKind.Property,
      type: DeviceV2ValueType.UnsignedInteger, access: 5, telemetryMinimumIntervalMs: 1000 },
  ] };
  const page = await verifiedPage(manifest);
  const store = new DeviceV2Store();
  await store.applyManifestPage(id, page); store.markManifestAccepted(id, 1, manifest.fingerprint);
  store.beginState(id);
  store.applyStatePage(id, { revision: 3, cursor: 0, nextCursor: 2, totalFields: 2, values: {
    power: { type: DeviceV2ValueType.Boolean, value: false, cbor: Uint8Array.of(0xf4) },
    sample: { type: DeviceV2ValueType.UnsignedInteger, value: 0, cbor: uint(0) },
  } });
  const channel = new Channel();
  let epoch = 20;
  const session = new DirectDeviceSession(channel, store, 100,
    { permissions, features, maxFrameSize: 512, utcNow: () => 1789260000000 });
  const reply = (request: Bbp2Frame) => {
    if (request.kind === kind.TelemetryControl) {
      const value = control(request.body);
      channel.emit({ kind: kind.TelemetryStatus, flags: flags.IsResponse | flags.IdMode,
        sequence: request.sequence, body: status(value.streamId, value.operation === op.Open ? ++epoch : value.epoch,
          value.operation === op.Open ? code.Opened : value.operation === op.Renew ? code.Renewed : code.Closed) });
    } else if (request.kind === kind.Command) {
      channel.emit({ kind: kind.Ack, flags: flags.IsResponse, sequence: 600, body: encodeAckBody(request.sequence, 3) });
    }
  };
  channel.responder = reply;
  const sample = (streamId: number, streamEpoch: number, sequence = 1, value = 42, fieldId = 2) => channel.emit({
    kind: kind.TelemetryData, flags: flags.IdMode, sequence: 500,
    body: map([[0, uint(streamId)], [1, uint(streamEpoch)], [2, uint(sequence)], [3, uint(12345)],
      [4, map([[fieldId, uint(value)]])]]),
  });
  return { session, channel, reply, sample, store, manifest };
}

afterEach(() => { vi.useRealTimers(); });

describe('Direct realtime on the existing authenticated frame channel', () => {
  it('keeps old peers controllable and rejects unsupported telemetry before sending', async () => {
    const f = await fixture(3, BBP2_FEATURE_TIME_SYNC);
    try {
      await f.session.command('power', true);
      await expect(f.session.openTelemetry(['sample'], 1000)).rejects.toThrow('DIRECT_TELEMETRY_NOT_SUPPORTED');
      expect(f.channel.sent.map(frame => frame.kind)).toEqual([kind.Command]);
    } finally { await f.session.close(); }
  });

  it('admits Observe-only but not Write-only permissions', async () => {
    const observed = await fixture(1), writeOnly = await fixture(2);
    try {
      const lease = await observed.session.openTelemetry(['sample'], 1000);
      expect(lease.snapshot.active).toBe(true);
      await expect(writeOnly.session.openTelemetry(['sample'], 1000)).rejects.toThrow('DIRECT_TELEMETRY_OBSERVE_REQUIRED');
      expect(writeOnly.channel.sent).toHaveLength(0);
      await lease.close();
    } finally { await observed.session.close(); await writeOnly.session.close(); }
  });

  it.each([[['power']], [['unknown']], [['sample', 'sample']]])('rejects invalid readonly realtime selections %j', async keys => {
    const f = await fixture();
    try {
      await expect(f.session.openTelemetry(keys, 1000)).rejects.toThrow();
      expect(f.channel.sent).toHaveLength(0);
    } finally { await f.session.close(); }
  });

  it('uses exact ID Control/Status and stores telemetry independently of ordinary State', async () => {
    const f = await fixture();
    try {
      const state = f.store.snapshot(id), lease = await f.session.openTelemetry(['sample'], 1000);
      const request = f.channel.sent[0];
      expect(request.flags).toBe(flags.IdMode); expect(request.sequence).toBeGreaterThan(0);
      expect(control(request.body)).toEqual({ operation: op.Open, streamId: lease.snapshot.streamId,
        epoch: 0, leaseMs: 30000, intervalMs: 1000, fieldIds: [2] });
      f.sample(lease.snapshot.streamId, lease.snapshot.epoch);
      await vi.waitFor(() => expect(lease.snapshot.values['sample']?.value).toBe(42));
      expect(lease.snapshot).toMatchObject({ sampleSequence: 1, sampleMonotonicMs: 12345, missedSamples: 0 });
      expect(lease.snapshot.receivedMonotonicMs).toBeGreaterThanOrEqual(0);
      expect(f.store.snapshot(id)).toEqual(state);
      await lease.close();
      expect(control(f.channel.sent[1].body).operation).toBe(op.Close);
      expect(lease.snapshot.values).toEqual({});
    } finally { await f.session.close(); }
  });

  it('does not let Data, asynchronous Status, Time or Patch consume a pending ordinary command', async () => {
    const f = await fixture();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000);
      let commandFrame: Bbp2Frame | undefined;
      f.channel.responder = request => {
        if (request.kind === kind.Command) commandFrame = request;
        else f.reply(request);
      };
      const command = f.session.command('power', true);
      await vi.waitFor(() => expect(commandFrame).toBeDefined());
      f.sample(lease.snapshot.streamId, lease.snapshot.epoch);
      f.channel.emit({ kind: kind.TelemetryStatus, flags: flags.IdMode, sequence: 701,
        body: status(999, 1, code.Expired) });
      f.channel.emit({ kind: kind.TimeRequest, flags: 0, sequence: 702,
        body: encodeTimeRequest(new Uint8Array(16).fill(1)) });
      f.channel.emit({ kind: kind.Patch, flags: flags.IdMode | flags.AckRequired, sequence: 703,
        body: map([[0, uint(0)], [1, uint(4)], [2, map([[1, Uint8Array.of(0xf5)]])]]) });
      await vi.waitFor(() => expect(f.store.snapshot(id).stateRevision).toBe(4));
      expect(f.channel.sent.some(frame => frame.kind === kind.TimeResponse && frame.sequence === 702)).toBe(true);
      f.reply(commandFrame!);
      await expect(command).resolves.toMatchObject({ acknowledgedSequence: commandFrame!.sequence });
      expect(lease.snapshot.active).toBe(true); expect(lease.snapshot.values['sample']?.value).toBe(42);
    } finally { await f.session.close(); }
  });

  it('renews through the existing single-flight queue and hides/closes without retaining samples', async () => {
    const f = await fixture(); vi.useFakeTimers();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000);
      f.sample(lease.snapshot.streamId, lease.snapshot.epoch); await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10000);
      expect(f.channel.sent.map(frame => control(frame.body).operation)).toEqual([op.Open, op.Renew]);
      await lease.setVisible(false);
      expect(lease.snapshot).toMatchObject({ active: false, visible: false, values: {} });
      const oldEpoch = lease.snapshot.epoch;
      f.sample(lease.snapshot.streamId, oldEpoch, 2); await vi.advanceTimersByTimeAsync(0);
      expect(lease.snapshot.values).toEqual({});
      await vi.advanceTimersByTimeAsync(30000);
      expect(f.channel.sent).toHaveLength(3);
      await lease.setVisible(true);
      expect(lease.snapshot.epoch).not.toBe(oldEpoch);
      await lease.close(); expect(vi.getTimerCount()).toBe(0);
    } finally { await f.session.close(); }
  });

  it('isolates streams, old epochs and duplicate samples and reopens an expired lease', async () => {
    const f = await fixture();
    try {
      const first = await f.session.openTelemetry(['sample'], 1000);
      const second = await f.session.openTelemetry(['sample'], 1000);
      const originalEpoch = first.snapshot.epoch;
      f.sample(first.snapshot.streamId, originalEpoch, 1, 10);
      await vi.waitFor(() => expect(first.snapshot.values['sample']?.value).toBe(10));
      f.sample(first.snapshot.streamId, originalEpoch, 1, 99);
      f.sample(second.snapshot.streamId, second.snapshot.epoch + 100, 1, 88);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(first.snapshot.values['sample']?.value).toBe(10); expect(second.snapshot.values).toEqual({});
      f.channel.emit({ kind: kind.TelemetryStatus, flags: flags.IdMode, sequence: 704,
        body: status(first.snapshot.streamId, originalEpoch, code.Expired) });
      await vi.waitFor(() => expect(first.snapshot.epoch).not.toBe(originalEpoch));
      expect(first.snapshot.values).toEqual({});
      f.sample(first.snapshot.streamId, originalEpoch, 2, 77);
      f.sample(second.snapshot.streamId, second.snapshot.epoch, 1, 20);
      await vi.waitFor(() => expect(second.snapshot.values['sample']?.value).toBe(20));
      expect(first.snapshot.values).toEqual({});
    } finally { await f.session.close(); }
  });

  it.each(['renew', 'close'] as const)('a typed wire rejection of %s leaves ordinary control usable', async operation => {
    const f = await fixture(); vi.useFakeTimers();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000), errors = vi.fn();
      f.session.subscribeErrors(errors);
      f.channel.responder = request => {
        if (request.kind === kind.TelemetryControl && control(request.body).operation !== op.Open) {
          f.channel.emit({ kind: kind.Error, flags: flags.IsResponse, sequence: request.sequence,
            body: map([[0, uint(Bbp2ErrorCode.RateLimited)], [1, uint(request.sequence)]]) });
        } else f.reply(request);
      };
      if (operation === 'renew') await vi.advanceTimersByTimeAsync(10000);
      else await expect(lease.close()).rejects.toBeInstanceOf(DirectDeviceProtocolError);
      expect(lease.snapshot.active).toBe(false); expect(errors).not.toHaveBeenCalled();
      expect(f.session.state).toBe('ready'); expect(vi.getTimerCount()).toBe(0);
      await expect(f.session.command('power', true)).resolves.toBeDefined();
    } finally { await f.session.close(); }
  });

  it.each(['sequence', 'flags', 'body'] as const)('rejects malformed Status %s and closes the carrier', async failure => {
    const f = await fixture();
    try {
      f.channel.responder = request => f.channel.emit({ kind: kind.TelemetryStatus,
        flags: failure === 'flags' ? flags.IsResponse : flags.IsResponse | flags.IdMode,
        sequence: request.sequence + Number(failure === 'sequence'),
        body: failure === 'body' ? map([]) : status(1, 21, code.Opened) });
      await expect(f.session.openTelemetry(['sample'], 1000)).rejects.toThrow();
      expect(f.session.state).toBe('closed');
    } finally { await f.session.close(); }
  });

  it.each(['flags', 'sequence', 'unknownField'] as const)('rejects malformed Data %s', async failure => {
    const f = await fixture();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000);
      f.channel.emit({ kind: kind.TelemetryData,
        flags: failure === 'flags' ? flags.IdMode | flags.AckRequired : flags.IdMode,
        sequence: failure === 'sequence' ? 0 : 500,
        body: map([[0, uint(lease.snapshot.streamId)], [1, uint(lease.snapshot.epoch)], [2, uint(1)], [3, uint(1)],
          [4, map([[failure === 'unknownField' ? 999 : 2, uint(42)]])]]) });
      await vi.waitFor(() => expect(f.session.state).toBe('closed'));
      expect(lease.snapshot).toMatchObject({ active: false, values: {} });
    } finally { await f.session.close(); }
  });

  it.each(['close', 'receiveFailure'] as const)('immediately resets lease state/timers on %s', async failure => {
    const f = await fixture(); vi.useFakeTimers();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000), listener = vi.fn();
      lease.subscribe(listener);
      f.sample(lease.snapshot.streamId, lease.snapshot.epoch); await vi.advanceTimersByTimeAsync(0);
      expect(lease.snapshot.values['sample']?.value).toBe(42);
      if (failure === 'close') await f.session.close();
      else { f.channel.fail(Error('link disconnected')); await vi.advanceTimersByTimeAsync(0); }
      expect(lease.snapshot).toMatchObject({ active: false, visible: false, values: {} });
      expect(vi.getTimerCount()).toBe(0); expect(listener).toHaveBeenLastCalledWith(lease.snapshot);
      await lease.close();
    } finally { await f.session.close(); }
  });

  it('a late Open cannot populate a closed session or create a renew timer', async () => {
    const f = await fixture(); vi.useFakeTimers();
    let release!: () => void;
    f.channel.beforeSend = () => new Promise(resolve => { release = resolve; });
    const opened = f.session.openTelemetry(['sample'], 1000);
    const rejected = expect(opened).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0); expect(f.channel.sent).toHaveLength(1);
    await f.session.close(); release(); await rejected;
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.session.state).toBe('closed'); expect(f.channel.sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serializes telemetry preparation and Control behind a pending ordinary command', async () => {
    const f = await fixture();
    try {
      let commandFrame: Bbp2Frame | undefined;
      f.channel.responder = request => {
        if (request.kind === kind.Command) commandFrame = request;
        else f.reply(request);
      };
      const command = f.session.command('power', true);
      await vi.waitFor(() => expect(commandFrame).toBeDefined(), { interval: 1 });
      const opened = f.session.openTelemetry(['sample'], 1000);
      await Promise.resolve(); await Promise.resolve();
      expect(f.channel.sent).toHaveLength(1); f.reply(commandFrame!);
      await command; const lease = await opened;
      expect(f.channel.sent.map(frame => frame.kind)).toEqual([kind.Command, kind.TelemetryControl]);
      expect(lease.snapshot.active).toBe(true);
    } finally { await f.session.close(); }
  });

  it('drops undecodable best-effort Data during Manifest acceptance without breaking synchronization', async () => {
    const f = await fixture();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000);
      f.store.invalidate(id);
      f.sample(lease.snapshot.streamId, lease.snapshot.epoch);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(f.session.state).toBe('ready'); expect(lease.snapshot.values).toEqual({});
      const page = decodeCachedManifest(f.manifest);
      await f.store.applyManifestPage(id, page); f.store.markManifestAccepted(id, 1, f.manifest.fingerprint);
      f.sample(lease.snapshot.streamId, lease.snapshot.epoch, 2);
      await vi.waitFor(() => expect(lease.snapshot.values['sample']?.value).toBe(42));
    } finally { await f.session.close(); }
  });

  it('a record send failure still closes the carrier and cannot leave a live lease', async () => {
    const f = await fixture(); vi.useFakeTimers();
    try {
      const errors = vi.fn(); f.session.subscribeErrors(errors);
      f.channel.beforeSend = async () => { throw Error('record write failed'); };
      await expect(f.session.openTelemetry(['sample'], 1000)).rejects.toThrow('record write failed');
      expect(f.session.state).toBe('closed'); expect(errors).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { await f.session.close(); }
  });

  it('retires leases on Manifest refresh, sends existing Close, and ignores old-epoch unknown fields', async () => {
    const f = await fixture();
    try {
      const lease = await f.session.openTelemetry(['sample'], 1000), previous = lease.snapshot;
      f.sample(previous.streamId, previous.epoch);
      await vi.waitFor(() => expect(lease.snapshot.values['sample']?.value).toBe(42));
      const replacement = { ...f.manifest, revision: 2, fields: f.manifest.fields.map(
        field => field.id === 2 ? { ...field, key: 'newSample' } : field,
      ) };
      const page = await verifiedPage(replacement), errors = vi.fn();
      f.session.subscribeErrors(errors);
      f.channel.responder = request => {
        if (request.kind === kind.ManifestRequest) {
          f.channel.emit({ kind: kind.Manifest, flags: flags.IsResponse, sequence: request.sequence,
            body: map([[0, uint(2)], [1, encodeCanonicalByteString(page.fingerprint)],
              [2, uint(0)], [3, uint(2)], [4, uint(2)], [5, encodeCanonicalArray(page.encodedFields)]]) });
        } else if (request.kind === kind.ManifestAccept) {
          f.channel.emit({ kind: kind.Ack, flags: flags.IsResponse, sequence: 700,
            body: encodeAckBody(request.sequence) });
        } else if (request.kind === kind.StateRequest) {
          f.channel.emit({ kind: kind.StatePage, flags: flags.IsResponse | flags.IdMode, sequence: request.sequence,
            body: map([[0, uint(3)], [1, uint(0)], [2, uint(2)], [3, uint(2)],
              [4, map([[1, Uint8Array.of(0xf4)], [2, uint(0)]])]]) });
        } else f.reply(request);
      };
      await f.session.refresh();
      expect(lease.snapshot).toMatchObject({ active: false, visible: false, values: {} });
      await vi.waitFor(() => expect(f.channel.sent.some(request => request.kind === kind.TelemetryControl
        && control(request.body).operation === op.Close)).toBe(true));
      f.sample(previous.streamId, previous.epoch, 2, 88, 999);
      const current = await f.session.openTelemetry(['newSample'], 1000);
      f.sample(current.snapshot.streamId, current.snapshot.epoch);
      await vi.waitFor(() => expect(current.snapshot.values['newSample']?.value).toBe(42));
      expect(current.snapshot.values['sample']).toBeUndefined();
      expect(f.session.state).toBe('ready'); expect(errors).not.toHaveBeenCalled();
      await expect(f.session.command('power', true)).resolves.toBeDefined();
    } finally { await f.session.close(); }
  });
});
