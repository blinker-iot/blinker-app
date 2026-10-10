import { describe, expect, it, vi } from 'vitest';

import { Bbp2MessageKind } from '../../protocol/device-v2';
import { DirectSecureInitiator } from './crypto';
import { BleDirectSecureChannel } from './secure-channel';
import { BleDirectRecordLink, BleDirectTarget } from './transport';
import { BleApplicationMode } from './wire';

class ConcurrentProbeSecure {
  active = 0;
  maximumConcurrent = 0;

  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    this.active += 1;
    this.maximumConcurrent = Math.max(this.maximumConcurrent, this.active);
    try {
      await new Promise(resolve => setTimeout(resolve, 5));
      return plaintext.slice();
    } finally {
      this.active -= 1;
    }
  }

  async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
    return ciphertext.slice();
  }

  clear(): void {}
}

class ConcurrentProbeLink implements BleDirectRecordLink {
  active = 0;
  maximumConcurrent = 0;
  sent = 0;

  async sendRecord(_record: Uint8Array): Promise<void> {
    this.active += 1;
    this.maximumConcurrent = Math.max(this.maximumConcurrent, this.active);
    try {
      await new Promise(resolve => setTimeout(resolve, 5));
      this.sent += 1;
    } finally {
      this.active -= 1;
    }
  }

  receiveRecord(): Promise<Uint8Array> {
    return Promise.reject(new Error('unused'));
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  connect(_target: BleDirectTarget): Promise<void> {
    return Promise.resolve();
  }

  waitForMode(_mode: BleApplicationMode): Promise<BleDirectTarget> {
    return Promise.reject(new Error('unused'));
  }
}

describe('BleDirectSecureChannel', () => {
  it('bounds active plus queued sends at two without poisoning the accepted writes', async () => {
    const secure = new ConcurrentProbeSecure(), link = new ConcurrentProbeLink();
    const channel = new BleDirectSecureChannel('device_child', link, secure as unknown as DirectSecureInitiator, 512, 0);
    const frame = () => channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(1));
    const first = channel.send(frame()), second = channel.send(frame());
    await expect(channel.send(frame())).rejects.toThrow('BLE_DIRECT_TX_CAPACITY');
    await Promise.all([first, second]); expect(link.sent).toBe(2); await channel.close();
  });
  it('close cancels native work immediately and late encryption cannot send', async () => {
    const secure = new ConcurrentProbeSecure(), link = new ConcurrentProbeLink();
    let finish!: (record: Uint8Array) => void;
    secure.encrypt = () => new Promise(resolve => { finish = resolve; });
    link.disconnect = vi.fn(async () => undefined);
    const channel = new BleDirectSecureChannel('device_child', link, secure as unknown as DirectSecureInitiator, 512, 0);
    const sending = channel.send(channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(1))).catch(error => error);
    await vi.waitFor(() => expect(finish).toBeDefined());
    await channel.close(); expect(link.disconnect).toHaveBeenCalledOnce();
    finish(Uint8Array.of(1)); expect(await sending).toBeInstanceOf(Error);
    expect(link.sent).toBe(0); expect(link.disconnect).toHaveBeenCalledOnce();
  });
  it('operation keeps its first cause while close callers see native release failure', async () => {
    const secure = new ConcurrentProbeSecure(), link = new ConcurrentProbeLink();
    link.sendRecord = async () => { throw Error('SEND_FAILED'); };
    link.disconnect = vi.fn(async () => { throw Error('NATIVE_CLOSE_FAILED'); });
    const channel = new BleDirectSecureChannel('device_child', link, secure as unknown as DirectSecureInitiator, 512, 0);
    await expect(channel.send(channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(1)))).rejects.toThrow('SEND_FAILED');
    await expect(channel.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    await expect(channel.close()).rejects.toThrow('NATIVE_CLOSE_FAILED');
    expect(link.disconnect).toHaveBeenCalledOnce();
  });
  it.each(['close', 'failure', 'close-during-send-failure'])('%s does not finish cleanup until native disconnect settles', async cause => {
    const secure = new ConcurrentProbeSecure(), link = new ConcurrentProbeLink();
    let finish!: () => void, rejectSend!: (error: Error) => void;
    const cleanup = new Promise<void>(r => { finish = r; });
    link.disconnect = vi.fn(() => cleanup);
    link.sendRecord = () => new Promise<void>((_r, reject) => { rejectSend = reject; });
    const channel = new BleDirectSecureChannel('device_child', link, secure as unknown as DirectSecureInitiator, 512, 0);
    const original = Error('SEND_FAILED');
    let sending: Promise<unknown> = Promise.resolve();
    if (cause !== 'close') {
      sending = channel.send(channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(1))).catch(e => e);
      await vi.waitFor(() => expect(rejectSend).toBeDefined());
    }
    if (cause === 'failure') {
      rejectSend(original); await vi.waitFor(() => expect(link.disconnect).toHaveBeenCalled());
    }
    let closed = 0;
    const first = channel.close().then(() => { closed++; });
    const second = channel.close().then(() => { closed++; });
    if (cause === 'close-during-send-failure') rejectSend(original);
    await vi.waitFor(() => expect(link.disconnect).toHaveBeenCalled());
    expect(closed).toBe(0); finish(); await Promise.all([first, second]); expect(closed).toBe(2);
    if (cause !== 'close') expect(await sending).toBe(original);
  });

  it('preserves the first failure when disconnect rejects the concurrent receive', async () => {
    const secure = new ConcurrentProbeSecure();
    const link = new ConcurrentProbeLink();
    const original = new Error('EDGE_GATEWAY_PERMIT_JOIN_DOWN_ACK_MISMATCH');
    const disconnected = new Error('EDGE_GATEWAY_PERMIT_JOIN_DISCONNECTED');
    let rejectReceive!: (error: Error) => void;
    link.receiveRecord = () => new Promise((_resolve, reject) => { rejectReceive = reject; });
    link.sendRecord = async () => { throw original; };
    link.disconnect = async () => {
      rejectReceive(disconnected);
      // Real link cleanup is asynchronous; the receive pump sees its result
      // before the failing sender completes cleanup.
      await new Promise(resolve => setTimeout(resolve, 0));
    };
    const channel = new BleDirectSecureChannel(
      'device_child', link, secure as unknown as DirectSecureInitiator, 512, 0,
    );
    const incoming = channel.receive().catch(error => error);
    const frame = channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(1));
    const outgoing = channel.send(frame).catch(error => error);
    const queued = channel.send(frame).catch(error => error);
    expect(await incoming).toBe(original);
    expect(await outgoing).toBe(original);
    expect(await queued).toBe(original);
  });

  it('serializes encryption and complete record sends', async () => {
    const secure = new ConcurrentProbeSecure();
    const link = new ConcurrentProbeLink();
    const channel = new BleDirectSecureChannel(
      'device_child',
      link,
      secure as unknown as DirectSecureInitiator,
      512,
      0,
    );
    const first = channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(1));
    const second = channel.createFrame(Bbp2MessageKind.Hello, 0, Uint8Array.of(2));

    await Promise.all([channel.send(first), channel.send(second)]);

    expect(secure.maximumConcurrent).toBe(1);
    expect(link.maximumConcurrent).toBe(1);
    expect(link.sent).toBe(2);
    await channel.close();
  });
});
