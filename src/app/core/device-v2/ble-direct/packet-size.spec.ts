import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  mtu: vi.fn(async () => ({ value: 247 })),
  client: {
    initialize: vi.fn(async () => undefined), connect: vi.fn(async () => undefined),
    getServices: vi.fn(async () => [{ uuid: '5f6d0001-3f5b-4e4f-9f4d-626c696e6b32', characteristics: [
      { uuid: '5f6d0002-3f5b-4e4f-9f4d-626c696e6b32', properties: { write: true } },
      { uuid: '5f6d0003-3f5b-4e4f-9f4d-626c696e6b32', properties: { notify: true } },
    ] }]),
    startNotifications: vi.fn(async (_id: string, _service: string, _characteristic: string,
      _notify: (value: DataView) => void) => undefined),
    stopNotifications: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    write: vi.fn(async (_id: string, _service: string, _characteristic: string, _value: DataView) => undefined),
    getMtu: vi.fn(() => { throw Error('must not poison shared GATT queue'); }),
  },
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: native.client, BluetoothLe: { getMtu: native.mtu }, ScanMode: { SCAN_MODE_LOW_LATENCY: 2 },
}));
import { CapacitorBleDirectRecordLink, FragmentReassembler, fragmentBleRecord } from './transport';
import { BleApplicationMode } from './wire';

const target = (deviceId: string) => ({ device: { deviceId }, profile: { mode: BleApplicationMode.Direct,
  wireVersion: 3, capabilities: 0x51, modeLocator: new Uint8Array(8).fill(1) } });
const notify = (value: Uint8Array) => native.client.startNotifications.mock.calls.at(-1)![3](new DataView(value.buffer));
const turn = async () => { for (let index = 0; index < 16; ++index) await Promise.resolve(); };

describe('bounded BLE packet negotiation carrier', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); native.mtu.mockResolvedValue({ value: 247 }); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('native MTU is only a fact; bootstrap remains20 until authenticated acceptance', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('bootstrap'));
    expect(await link.maxPacketSize()).toBe(244);
    const sending = link.sendRecord(new Uint8Array(40)); await turn();
    expect(native.client.write.mock.calls[0]![3].byteLength).toBe(20);
    await vi.advanceTimersByTimeAsync(29); expect(native.client.write).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(31); await sending;
    expect(native.client.write.mock.calls.map(call => call[3].byteLength)).toEqual([20, 20, 12]);
    expect(native.client.getMtu).not.toHaveBeenCalled(); await link.disconnect();
  });

  it('accepted244 reduces520-byte records to three credit-serialized packets with10ms spacing', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('large'));
    await link.maxPacketSize(); link.applyPacketSize(244);
    const sending = link.sendRecord(new Uint8Array(520)); await turn();
    expect(native.client.write).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(9); expect(native.client.write).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(11); await sending;
    expect(native.client.write.mock.calls.map(call => call[3].byteLength)).toEqual([244, 244, 44]);
    await link.disconnect(); await link.connect(target('large'));
    const baseline = link.sendRecord(new Uint8Array(40)); await vi.advanceTimersByTimeAsync(60); await baseline;
    expect(native.client.write.mock.calls.slice(3).map(call => call[3].byteLength)).toEqual([20, 20, 12]);
    await link.disconnect();
  });

  it.each([0, 22, 23.5, 518, NaN])('invalid native MTU%s safely retains20', async value => {
    native.mtu.mockResolvedValueOnce({ value });
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target(`invalid-${value}`));
    expect(await link.maxPacketSize()).toBe(20);
    expect(() => link.applyPacketSize(21)).toThrow('BLE_DIRECT_PACKET_SIZE_INVALID'); await link.disconnect();
  });

  it('native rejection or an unsettled250ms probe retains20 and late results cannot activate it', async () => {
    native.mtu.mockRejectedValueOnce(Error('unavailable'));
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('mtu-timeout'));
    expect(await link.maxPacketSize()).toBe(20);
    let finish!: (value: { value: number }) => void;
    native.mtu.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const probe = link.maxPacketSize(); await vi.advanceTimersByTimeAsync(250); expect(await probe).toBe(20);
    finish({ value: 247 }); await turn();
    expect(() => link.applyPacketSize(244)).toThrow('BLE_DIRECT_PACKET_SIZE_INVALID'); await link.disconnect();
  });

  it('cancel during the optional native probe does not return stale capacity', async () => {
    let finish!: (value: { value: number }) => void;
    native.mtu.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('cancel-probe'));
    const probe = link.maxPacketSize().catch(error => error); await link.disconnect(); finish({ value: 247 });
    expect((await probe).message).toBe('BLE_DIRECT_NOT_CONNECTED');
  });

  it('rejects concurrent records and mid-frame resize without interleaving fragment IDs', async () => {
    let finish!: () => void;
    native.client.write.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('tx-boundary')); await link.maxPacketSize();
    const sending = link.sendRecord(new Uint8Array(40)); await turn();
    await expect(link.sendRecord(Uint8Array.of(1))).rejects.toThrow('BLE_DIRECT_TX_BUSY');
    expect(() => link.applyPacketSize(244)).toThrow('BLE_DIRECT_PACKET_BOUNDARY_REQUIRED');
    finish(); await vi.advanceTimersByTimeAsync(60); await sending;
    link.applyPacketSize(244); await link.disconnect();
  });

  it('rejects resize during RX and accepts frame-boundary20 fallback under a244 receive limit', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('rx-boundary')); await link.maxPacketSize();
    const baseline = fragmentBleRecord(new Uint8Array(40), 20, 1); notify(baseline[0]!);
    expect(() => link.applyPacketSize(244)).toThrow('BLE_DIRECT_PACKET_BOUNDARY_REQUIRED');
    notify(baseline[1]!); notify(baseline[2]!); expect((await link.receiveRecord()).length).toBe(40);
    link.applyPacketSize(244);
    for (const fragment of fragmentBleRecord(new Uint8Array(480), 244, 2)) notify(fragment);
    expect((await link.receiveRecord()).length).toBe(480);
    for (const fragment of fragmentBleRecord(new Uint8Array(40), 20, 3)) notify(fragment);
    expect((await link.receiveRecord()).length).toBe(40); await link.disconnect();
  });

  it('unknown large write outcome closes without retry; exactly one new acquisition uses20', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('unknown-outcome'));
    await link.maxPacketSize(); link.applyPacketSize(244);
    native.client.write.mockRejectedValueOnce(Error('unknown delivery'));
    await expect(link.sendRecord(new Uint8Array(520))).rejects.toThrow('unknown delivery');
    expect(native.client.write).toHaveBeenCalledOnce(); expect(native.client.disconnect).toHaveBeenCalledOnce();
    const next = new CapacitorBleDirectRecordLink(); await next.connect(target('unknown-outcome'));
    expect(await next.maxPacketSize()).toBe(20); expect(native.mtu).toHaveBeenCalledOnce(); await next.disconnect();
    const third = new CapacitorBleDirectRecordLink(); await third.connect(target('unknown-outcome'));
    expect(await third.maxPacketSize()).toBe(244); await third.disconnect();
  });

  it('admits a large next record immediately after the20-byte Hello before async TX acceptance', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('response-race'));
    await link.maxPacketSize(); link.preparePacketNegotiation(244);
    const response = link.receiveRecord();
    for (const fragment of fragmentBleRecord(new Uint8Array(40), 20, 1)) notify(fragment);
    const follow = fragmentBleRecord(new Uint8Array(300), 244, 2);
    notify(follow[0]!);
    expect((await response).length).toBe(40);
    // No RX stride changes; the first large fragment is already captured.
    link.applyPacketSize(244); notify(follow[1]!);
    expect((await link.receiveRecord()).length).toBe(300); await link.disconnect();
  });

  it('negotiation failure can mark a20 successor without mutating the live packet stride', async () => {
    const link = new CapacitorBleDirectRecordLink(); await link.connect(target('negotiation-failure'));
    await link.maxPacketSize(); link.rememberPacketFallback(); await link.disconnect();
    const next = new CapacitorBleDirectRecordLink(); await next.connect(target('negotiation-failure'));
    expect(await next.maxPacketSize()).toBe(20); await next.disconnect();
  });
});

describe('BLE frame-local fragment stride', () => {
  it('retires an incomplete old frame at a new START but rejects same-ID restart and within-frame size changes', () => {
    const old = fragmentBleRecord(new Uint8Array(480), 244, 1);
    const baseline = fragmentBleRecord(new Uint8Array(40), 20, 2);
    const receiver = new FragmentReassembler(); receiver.push(old[0]!, 244);
    expect(receiver.push(baseline[0]!, 244)).toBeUndefined();
    receiver.push(baseline[1]!, 244); expect(receiver.push(baseline[2]!, 244)?.length).toBe(40);
    receiver.push(old[0]!, 244); expect(() => receiver.push(old[0]!, 244)).toThrow('BLE_DIRECT_FRAGMENT_INVALID');
    const record = fragmentBleRecord(new Uint8Array(600), 244, 3);
    receiver.push(record[0]!, 244);
    expect(() => receiver.push(record[1]!.slice(0, 20), 244)).toThrow('BLE_DIRECT_FRAGMENT_INVALID');
    expect(receiver.active).toBe(false);
  });

  it('keeps the existing1048-byte record bound and rejects oversized/unnegotiated packet limits', () => {
    expect(fragmentBleRecord(new Uint8Array(1048), 244, 1)).toHaveLength(5);
    for (const limit of [19, 245, 1000]) expect(() => fragmentBleRecord(Uint8Array.of(1), limit, 1)).toThrow();
    expect(() => fragmentBleRecord(new Uint8Array(1049), 244, 1)).toThrow();
    const receiver = new FragmentReassembler();
    expect(() => receiver.push(fragmentBleRecord(new Uint8Array(80), 244, 1)[0]!, 20)).toThrow();
  });
});
