import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalAccessClient, LocalAccessMessageLink, SelfLocalAccessRequest } from './client';
import { LocalAccessMaterial } from './api';
import { decodeLocalAccessGrant, localAccessNoisePrologue } from '../../protocol/device-v2/local-access';
import { BleDirectCrypto, NoiseNnInitiator, NoisePattern } from '../ble-direct/crypto';
import { encodeLocalSecureRecord, LocalSecureRecordType } from '../ble-direct/wire';

const golden = Object.fromEntries(readFileSync(path.resolve(process.cwd(),
  '../blinker-library/tests/golden/local_access_golden_vectors.properties'), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('=')));
const bytes = (name: string) => Uint8Array.from(Buffer.from(golden[name]!, 'hex'));
const responder = () => encodeLocalSecureRecord(LocalSecureRecordType.ResponderHandshake, new Uint8Array(48).fill(1));
const record = () => encodeLocalSecureRecord(LocalSecureRecordType.Transport, new Uint8Array(19).fill(2));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function harness(profile: 1 | 2 = 1) {
  const prefix = profile === 2 ? 'plain_' : '';
  const grant = decodeLocalAccessGrant(bytes(prefix + 'grant'));
  const request: SelfLocalAccessRequest = { securityProfile: profile, recipientLogicalDeviceId: 'wifi-A', targetLogicalDeviceId: '',
    targetDeviceInstanceId: grant.targetDeviceInstanceId, accessEpoch: 0, topologyVersion: 0,
    callerSessionId: grant.callerSessionId, requestId: new Uint8Array(16).fill(1), permissions: 3, lifetimeMillis: 5000 };
  const material: LocalAccessMaterial = { validForMillis: 5000, exactGrant: bytes(prefix + 'grant'), grant, sessionKey: bytes(profile === 2 ? 'plain_session_key' : 'noise_psk'),
    clear: vi.fn(function(this: LocalAccessMaterial) { this.sessionKey.fill(0); }) };
  const sent: Uint8Array[] = [];
  const link = { send: vi.fn(async (message: Uint8Array) => { sent.push(message.slice()); }), close: vi.fn(),
    receive: vi.fn().mockResolvedValueOnce(bytes(prefix + 'challenge'))
      .mockResolvedValueOnce(profile === 2 ? bytes('plain_recipient_proof') : responder()) };
  const api = { issue: vi.fn().mockResolvedValue(material) };
  const noise = { writeInitiator: vi.fn().mockResolvedValue(new Uint8Array(48).fill(3)),
    readResponder: vi.fn().mockResolvedValue(new Uint8Array()),
    encrypt: vi.fn().mockResolvedValue(new Uint8Array(19).fill(4)),
    decrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])), clear: vi.fn() };
  const create = vi.spyOn(NoiseNnInitiator, 'create').mockResolvedValue(noise as unknown as NoiseNnInitiator);
  const controller = new AbortController();
  const clock = { now: 100 };
  const crypto = profile === 2 ? new BleDirectCrypto() : {} as BleDirectCrypto;
  const client = new LocalAccessClient(link as LocalAccessMessageLink, api, crypto, () => clock.now);
  return { request, material, link, api, noise, create, controller, client, clock, sent, crypto };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Plain LAN session using real HMAC and shared lifecycle', () => {
  it('reopen uses remaining authorization time rather than restarting the grant lifetime', async () => {
    const h = harness(2); h.material.validForMillis = 900;
    await h.client.open(h.request, h.controller.signal);
    h.clock.now += 901;
    await expect(h.client.send(new Uint8Array([1]))).rejects.toThrow();
    expect(h.sent).toHaveLength(2); expect(h.link.close).toHaveBeenCalledOnce();
  });
  it('verifies directional golden proof, clears material and transfers unwrapped BBP bytes', async () => {
    const h = harness(2);
    try {
      const authorization = await h.client.open(h.request, h.controller.signal);
      expect(authorization).toEqual({ permissions: h.material.grant.permissions });
      expect(Object.isFrozen(authorization)).toBe(true);
      expect(h.sent).toEqual([bytes('plain_grant'), bytes('plain_caller_proof')]);
      expect(h.create).not.toHaveBeenCalled(); expect(h.material.sessionKey.every(byte => byte === 0)).toBe(true);
      const frame = new Uint8Array([0xb3,2,3]); await h.client.send(frame);
      expect(h.sent[2]).toEqual(frame); expect(frame[0]).toBe(0xb3);
      h.link.receive.mockResolvedValueOnce(frame); expect(await h.client.receive()).toEqual(frame);
    } finally { await h.client.close(); }
  });
  it('rejects reflection/corruption before ready and never retries as Noise', async () => {
    for (const reflected of [true, false]) {
      const h = harness(2), proof = bytes(reflected ? 'plain_caller_proof' : 'plain_recipient_proof');
      if (!reflected) proof[36] ^= 1;
      h.link.receive.mockReset().mockResolvedValueOnce(bytes('plain_challenge')).mockResolvedValueOnce(proof);
      await expect(h.client.open(h.request, h.controller.signal)).rejects.toThrow();
      expect(h.link.close).toHaveBeenCalledOnce(); expect(h.create).not.toHaveBeenCalled();
      expect(h.material.sessionKey.every(byte => byte === 0)).toBe(true);
      vi.restoreAllMocks();
    }
  });
  it('fences a late HMAC completion after owner cancellation and wipes its temporary proof', async () => {
    const h = harness(2), pending = deferred<Uint8Array>();
    const hmac = vi.spyOn(h.crypto, 'hmac').mockReturnValue(pending.promise);
    const opened = h.client.open(h.request, h.controller.signal);
    const rejected = expect(opened).rejects.toThrow();
    await vi.waitFor(() => expect(hmac).toHaveBeenCalledOnce());
    h.controller.abort(); const proof = new Uint8Array(32).fill(9); pending.resolve(proof); await rejected;
    expect(hmac).toHaveBeenCalledOnce(); expect(proof.every(byte => byte === 0)).toBe(true);
    expect(h.sent).toHaveLength(1); expect(h.material.sessionKey.every(byte => byte === 0)).toBe(true);
  });
  it('uses the same expiry and bounded-frame rules without relying on a background timer', async () => {
    const h = harness(2); await h.client.open(h.request, h.controller.signal);
    await expect(h.client.send(new Uint8Array(401))).rejects.toThrow('LOCAL_ACCESS_FRAME_SIZE');
    h.clock.now += 5001;
    await expect(h.client.send(new Uint8Array([1]))).rejects.toThrow();
    expect(h.sent).toHaveLength(2); expect(h.link.close).toHaveBeenCalledOnce();
  });
});

describe('single-self LAN client ownership (mock native port and Noise)', () => {
  it.each([1, 3])('publishes actual permission %i only after recipient authentication, not the requested role', async permissions => {
    // The HTTP/Noise ports are mocked here; real HTTP exact-grant validation
    // and Plain HMAC proof rejection remain in their respective suites.
    const h = harness(), pending = deferred<Uint8Array>();
    h.material.grant.permissions = permissions;
    h.request.permissions = permissions === 1 ? 3 : 1;
    h.noise.readResponder.mockReturnValueOnce(pending.promise);
    const resolved = vi.fn();
    const opening = h.client.open(h.request, h.controller.signal).then(value => { resolved(value); return value; });
    await vi.waitFor(() => expect(h.noise.readResponder).toHaveBeenCalledOnce());
    expect(resolved).not.toHaveBeenCalled();
    expect(h.material.clear).toHaveBeenCalledOnce();
    pending.resolve(new Uint8Array());
    try {
      const authorization = await opening;
      expect(authorization).toEqual({ permissions });
      expect(Object.isFrozen(authorization)).toBe(true);
      h.material.grant.permissions = 0;
      expect(authorization.permissions).toBe(permissions);
    } finally { await h.client.close(); }
  });

  it('does not treat a Plain challenge as a Noise candidate or request any material', async () => {
    const h = harness(); h.link.receive.mockReset().mockResolvedValueOnce(bytes('plain_challenge'));
    await expect(h.client.open(h.request, h.controller.signal)).rejects.toThrow('LOCAL_ACCESS_PROFILE_MISMATCH');
    expect(h.api.issue).not.toHaveBeenCalled(); expect(h.link.send).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled(); expect(h.link.close).toHaveBeenCalledOnce();
  });
  it('retains native cleanup failure for the owner while still wiping Noise keys', async () => {
    const h = harness();
    await h.client.open(h.request, h.controller.signal);
    h.link.close.mockRejectedValue(new Error('NATIVE_CLOSE_FAILED'));
    await expect(h.client.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    await expect(h.client.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    expect(h.link.close).toHaveBeenCalledOnce(); expect(h.noise.clear).toHaveBeenCalled();
  });

  it('relays the exact grant before LAN-domain NNpsk0 and sends no plaintext BBP Hello', async () => {
    const h = harness();
    try {
      await h.client.open(h.request, h.controller.signal);
      expect(h.api.issue.mock.calls[0]![0].exactChallenge).toEqual(bytes('challenge'));
      expect(h.link.send).toHaveBeenCalledTimes(2);
      expect(h.link.send.mock.calls[0]![0]).toEqual(bytes('grant'));
      expect(h.sent[1]).toEqual(encodeLocalSecureRecord(
        LocalSecureRecordType.InitiatorHandshake, new Uint8Array(48).fill(3)));
      expect(h.create.mock.calls[0]!.slice(1, 3)).toEqual([NoisePattern.NnPsk0, localAccessNoisePrologue()]);
      expect(h.material.clear).toHaveBeenCalledOnce();
      expect(h.material.sessionKey.every(byte => byte === 0)).toBe(true);
      await h.client.send(new Uint8Array([1, 2, 3]));
      h.link.receive.mockResolvedValueOnce(record());
      expect(await h.client.receive()).toEqual(new Uint8Array([1, 2, 3]));
    } finally { h.client.close(); }
    expect(h.link.close).toHaveBeenCalledOnce();
  });

  it('snapshots the requested identity and refuses a different candidate before HTTP', async () => {
    const h = harness(); h.request.targetDeviceInstanceId = new Uint8Array(16).fill(9);
    await expect(h.client.open(h.request, h.controller.signal)).rejects.toThrow('LOCAL_ACCESS_DEVICE_MISMATCH');
    expect(h.api.issue).not.toHaveBeenCalled(); expect(h.link.close).toHaveBeenCalledOnce();
  });

  it('closes child scope rather than routing it into the self Runtime', async () => {
    const h = harness(); h.request.targetLogicalDeviceId = 'child-A';
    await expect(h.client.open(h.request, h.controller.signal)).rejects.toThrow('LOCAL_ACCESS_SELF_REQUIRED');
    expect(h.link.receive).not.toHaveBeenCalled();
  });

  it('clears a grant that arrives after page exit and never sends it', async () => {
    const h = harness(), pending = deferred<LocalAccessMaterial>(); h.api.issue.mockReturnValue(pending.promise);
    const opening = h.client.open(h.request, h.controller.signal);
    const failed = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(h.api.issue).toHaveBeenCalledOnce());
    h.controller.abort(); pending.resolve(h.material); await failed;
    expect(h.material.clear).toHaveBeenCalledOnce(); expect(h.link.send).not.toHaveBeenCalled();
  });

  it('clears a late crypto result again after close, with no session resurrection', async () => {
    const h = harness(), pending = deferred<Uint8Array>(); h.noise.readResponder.mockReturnValue(pending.promise);
    const opening = h.client.open(h.request, h.controller.signal);
    const failed = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(h.noise.readResponder).toHaveBeenCalledOnce());
    h.controller.abort(); pending.resolve(new Uint8Array()); await failed;
    expect(h.noise.clear.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.link.close).toHaveBeenCalledOnce();
    await expect(h.client.send(new Uint8Array([1]))).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each(['send', 'receive'] as const)('wipes a late %s result after owner cancellation without native reuse', async direction => {
    const h = harness(), pending = deferred<Uint8Array>();
    await h.client.open(h.request, h.controller.signal);
    const transform = direction === 'send' ? h.noise.encrypt : h.noise.decrypt;
    transform.mockReturnValueOnce(pending.promise);
    if (direction === 'receive') h.link.receive.mockResolvedValueOnce(record());
    const operation = direction === 'send' ? h.client.send(new Uint8Array([1, 2, 3])) : h.client.receive();
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(transform).toHaveBeenCalledOnce());
    h.controller.abort();
    const late = new Uint8Array(direction === 'send' ? 19 : 3).fill(0x7b);
    pending.resolve(late); await rejected;
    expect(late.every(byte => byte === 0)).toBe(true);
    expect(h.sent).toHaveLength(2); // Only Grant/handshake, never a late business write.
    expect(h.link.close).toHaveBeenCalledOnce(); expect(h.noise.clear).toHaveBeenCalled();
  });

  it('allows one send and one receive concurrently, rejecting extra work before encryption', async () => {
    const h = harness(); await h.client.open(h.request, h.controller.signal);
    const pending = deferred<void>(); h.link.send.mockReturnValueOnce(pending.promise);
    const send = h.client.send(new Uint8Array([1]));
    await vi.waitFor(() => expect(h.noise.encrypt).toHaveBeenCalledOnce());
    await expect(h.client.send(new Uint8Array([2]))).rejects.toThrow('LOCAL_ACCESS_WOULD_BLOCK');
    h.link.receive.mockResolvedValueOnce(record()); expect(await h.client.receive()).toHaveLength(3);
    pending.resolve(); await send; expect(h.noise.encrypt).toHaveBeenCalledOnce(); h.client.close();
  });

  it('never retries a failed encrypted write or automatically routes an Action through MQTT', async () => {
    const h = harness(); await h.client.open(h.request, h.controller.signal);
    let rejectReceive!: (error: Error) => void;
    h.link.receive.mockImplementationOnce(() => new Promise<Uint8Array>((_resolve, reject) => { rejectReceive = reject; }));
    h.link.close.mockImplementationOnce(() => rejectReceive(new Error('native closed')));
    const received = expect(h.client.receive()).rejects.toThrow('native write uncertain');
    h.link.send.mockRejectedValueOnce(new Error('native write uncertain'));
    await expect(h.client.send(new Uint8Array([1]))).rejects.toThrow('native write uncertain');
    await received;
    expect(h.link.close).toHaveBeenCalledOnce(); expect(h.noise.encrypt).toHaveBeenCalledOnce();
  });

  it.each([new Uint8Array(), new Uint8Array(421), new Uint8Array([0xb2, 1]),
    encodeLocalSecureRecord(LocalSecureRecordType.Transport, new Uint8Array(16))])
    ('rejects malformed/oversize/unprotected records', async wire => {
      const h = harness(); await h.client.open(h.request, h.controller.signal);
      h.link.receive.mockResolvedValueOnce(wire);
      await expect(h.client.receive()).rejects.toThrow();
      expect(h.noise.decrypt).not.toHaveBeenCalled(); expect(h.link.close).toHaveBeenCalledOnce();
    });

  it('bounds idle lifetime and opening time without a renewal loop', async () => {
    vi.useFakeTimers(); const h = harness(); await h.client.open(h.request, h.controller.signal);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.link.close).toHaveBeenCalledOnce();
    const next = harness(), pending = deferred<Uint8Array>(); next.link.receive.mockReset().mockReturnValue(pending.promise);
    const opening = next.client.open(next.request, next.controller.signal);
    const failed = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(15000); expect(next.link.close).toHaveBeenCalledOnce();
    pending.resolve(bytes('challenge')); await failed;
    expect(next.api.issue).not.toHaveBeenCalled();
  });

  it('rechecks the deadline after suspended timers and clears keys even if native close throws', async () => {
    const h = harness(); await h.client.open(h.request, h.controller.signal);
    h.link.close.mockImplementationOnce(() => { throw new Error('native already gone'); });
    h.clock.now += 5000;
    await expect(h.client.send(new Uint8Array([1]))).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.noise.encrypt).not.toHaveBeenCalled(); expect(h.noise.clear).toHaveBeenCalled();
    expect(h.link.close).toHaveBeenCalledOnce();
  });
});
