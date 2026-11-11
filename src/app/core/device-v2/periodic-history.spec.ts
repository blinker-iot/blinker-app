import { parsePeriodicHistoryDetail, parsePeriodicHistoryPage, periodicHistoryCurves, periodicHistoryPolicyInput } from './periodic-history';

const id = 'device_a', hash = 'a'.repeat(64), query = { from: 1000, to: 1000000, limit: 50 };
function detail() {
  return { logicalDeviceId: id, manifestFingerprint: hash, fields: [{ key: 'reading', type: 2 }],
    policy: { revision: 1, enabled: true, manifestFingerprint: hash, keys: ['reading'], intervalMs: 60000, updatedAt: 1000 },
    runtime: { phase: 'active', failures: 0 }, limits: { intervalMs: 60000, maxFields: 4, maxAgeMs: 2592000000, maxRecords: 200000 },
    source: 'broker-telemetry', timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', canConfigure: true };
}
function row(n = 10, receivedAt = 10000) {
  return { id: String(n), segmentId: '12345678-1234-4234-9234-123456789abc', key: 'reading', type: 2,
    state: { type: 2, cbor: 'AQ', value: 1 }, policyRevision: 1, manifestFingerprint: hash,
    streamId: 1, epoch: 1, sampleSequence: n, monotonicMs: n * 1000, effectiveIntervalMs: 60000, receivedAt };
}
function page(items = [row()]) {
  return { logicalDeviceId: id, ...query, items, nextCursor: null,
    retention: { maxAgeMs: 2592000000, maxRecords: 200000 },
    source: 'broker-telemetry', timeBasis: 'serverReceivedAt', timeQuality: 'receipt-only', recordedTypes: [1, 2, 3, 4] };
}
describe('Online periodic history bounded contract', () => {
  it('parses independent policy/runtime facts and keeps unchanged-valued distinct samples', () => {
    expect(parsePeriodicHistoryDetail(detail(), id)).toEqual(detail());
    const value = page([row(11), row(10)]); delete (value as any).limit;
    expect(parsePeriodicHistoryPage(value, id, query).items).toHaveLength(2);
  });
  it('allows a null Manifest with no fields and an old disabled definition for owner recovery', () => {
    const value = { ...detail(), manifestFingerprint: null, fields: [], runtime: { phase: 'manifest-changed', failures: 1 } };
    expect(parsePeriodicHistoryDetail(value, id).policy!.keys).toEqual(['reading']);
  });
  it.each([
    { logicalDeviceId: 'other' }, { canConfigure: 'true' }, { fields: [{ key: 'reading', type: 0 }] },
    { fields: [{ key: 'reading', type: 2 }, { key: 'reading', type: 2 }] }, { fields: Array(257).fill({ key: 'x', type: 2 }) },
    { timeBasis: 'deviceSampledAt' }, { timeQuality: 'trusted' }, { runtime: { phase: 'active', failures: 65536 } },
    { runtime: { phase: 'recording', failures: 0 } }, { limits: { ...detail().limits, maxFields: 5 } },
  ])('rejects untrusted detail mismatch %j', patch => expect(() => parsePeriodicHistoryDetail({ ...detail(), ...patch }, id)).toThrow());
  it('validates the exact four-key PUT body before HTTP without injecting slot/frequency knobs', () => {
    expect(periodicHistoryPolicyInput({ expectedRevision: 0, enabled: false, manifestFingerprint: hash, keys: [' z ', 'a'] }).keys).toEqual([' z ', 'a']);
    for (const keys of [[], ['x', 'x'], ['1', '2', '3', '4', '5']]) {
      expect(() => periodicHistoryPolicyInput({ expectedRevision: 0, enabled: true, manifestFingerprint: hash, keys })).toThrow();
    }
    expect(() => periodicHistoryPolicyInput({ expectedRevision: 0, enabled: true, manifestFingerprint: hash, keys: ['x'], intervalMs: 1000 } as any)).toThrow();
  });
  it.each([
    { type: 0 }, { state: { type: 2, cbor: 'AQ', value: 2 } }, { receivedAt: 1000 - 1 },
    { key: 'other' }, { policyRevision: 0 }, { effectiveIntervalMs: 60001 }, { sampleSequence: 0 },
  ])('rejects malformed sample %j', patch => {
    const value = page([{ ...row(), ...patch }]); delete (value as any).limit;
    expect(() => parsePeriodicHistoryPage(value, id, { ...query, key: 'reading' })).toThrow();
  });
  it('rejects overlap/order and duplicate pages, but preserves exact uint64 values as text', () => {
    const value = page([row(10), row(11)]); delete (value as any).limit;
    expect(() => parsePeriodicHistoryPage(value, id, query)).toThrow();
    const exact = page([{ ...row(), state: { type: 2, cbor: 'G___________', value: '18446744073709551615', encoding: 'uint64' } as any }]);
    delete (exact as any).limit;
    expect(parsePeriodicHistoryPage(exact, id, query).items[0].state.value).toBe('18446744073709551615');
  });
  it('bounds visualization to 200 real points and breaks segments, time gaps and schema changes without interpolating', () => {
    const values = [row(1, 1000), row(2, 61000), { ...row(3, 121000), segmentId: 'other' },
      { ...row(4, 181000), policyRevision: 2 }, row(5, 900000)];
    const curve = periodicHistoryCurves(values)[0];
    expect(curve.paths).toHaveLength(4); expect(curve.dots).toHaveLength(5);
    expect(curve.paths[0]).toContain(' L'); expect(curve.min).toBe(1); expect(curve.max).toBe(1);
    expect(periodicHistoryCurves(Array.from({ length: 250 }, (_, n) => row(n + 1, n * 60000)))[0].dots).toHaveLength(200);
    expect(periodicHistoryCurves([{ ...row(), state: { type: 2, cbor: '', value: '18446744073709551615', encoding: 'uint64' } }])).toEqual([]);
  });
});
