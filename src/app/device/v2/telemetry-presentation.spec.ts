import { describe, expect, it } from 'vitest';
import {
  TELEMETRY_CHART_MAX_POINTS,
  TELEMETRY_PRESENTATION_MAX_FIELDS,
  TelemetryPresentation,
  TelemetryPresentationSnapshot,
  telemetryFreshnessLabel,
  telemetryIntervalLabel,
  telemetrySourceLabel,
} from './telemetry-presentation';

function sample(overrides: Partial<TelemetryPresentationSnapshot> = {}): TelemetryPresentationSnapshot {
  return { active: true, effectiveIntervalMs: 1000, source: 'cloud', streamId: 2, epoch: 3,
    sampleSequence: 1, sampleMonotonicMs: 9000, receivedMonotonicMs: 100,
    missedSamples: 0, values: { temperature: 24 }, ...overrides };
}

describe('bounded page telemetry presentation', () => {
  it('waits for a real sample, without fabricating data from status or State', () => {
    const model = new TelemetryPresentation();
    model.update(sample({ sampleSequence: undefined, receivedMonotonicMs: undefined,
      values: { temperature: 99 } }));
    expect(model.field('temperature', 100)).toMatchObject({ status: 'waiting', ageMs: null,
      value: undefined, points: [], source: 'cloud', effectiveIntervalMs: 1000 });
    model.update(sample({ receivedMonotonicMs: undefined }));
    expect(model.field('temperature', 100).status).toBe('waiting');
    model.update(sample());
    expect(model.field('missing-field', 100)).toMatchObject({ value: undefined,
      status: 'waiting', points: [] });
  });

  it('does not append duplicates, alter a value or renew freshness on repeated status', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    model.update(sample({ values: { temperature: 99 }, effectiveIntervalMs: 2000,
      receivedMonotonicMs: 5000 }));
    expect(model.field('temperature', 5000)).toMatchObject({ value: 24, ageMs: 4900,
      effectiveIntervalMs: 2000, status: 'fresh' });
    expect(model.field('temperature', 6100).status).toBe('stale');
    expect(model.field('temperature', 6100).points).toHaveLength(1);
  });

  it('ages from the local monotonic arrival time, not device uptime or UTC', () => {
    const model = new TelemetryPresentation();
    model.update(sample({ sampleMonotonicMs: 4_000_000_000 }));
    expect(model.field('temperature', 5099).status).toBe('fresh');
    expect(model.field('temperature', 5100)).toMatchObject({ ageMs: 5000, status: 'stale' });
    model.update(sample({ sampleSequence: 2, receivedMonotonicMs: 6100,
      effectiveIntervalMs: 5000 }));
    expect(model.field('temperature', 21099).status).toBe('fresh');
    expect(model.field('temperature', 21100).status).toBe('stale');
  });

  it('breaks curves on a sequence gap and rejects replay/out of order samples', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    model.update(sample({ sampleSequence: 4, receivedMonotonicMs: 4100, missedSamples: 2 }));
    model.update(sample({ sampleSequence: 3, receivedMonotonicMs: 5000,
      values: { temperature: -10 }, missedSamples: 2 }));
    const view = model.field('temperature', 5000);
    expect(view.points.map(point => point.breakBefore)).toEqual([false, true]);
    expect(view).toMatchObject({ value: 24, ageMs: 900, missedSamples: 2 });
  });

  it('excludes reserved zero at sequence wrap, without inventing a gap', () => {
    const model = new TelemetryPresentation();
    model.update(sample({ sampleSequence: 0xffffffff }));
    model.update(sample({ sampleSequence: 1, receivedMonotonicMs: 1100 }));
    expect(model.field('temperature', 1100).points).toHaveLength(2);
    expect(model.field('temperature', 1100).points[1].breakBefore).toBe(false);
    expect(model.field('temperature', 1100).missedSamples).toBe(0);
    model.update(sample({ sampleSequence: 3, receivedMonotonicMs: 2100, missedSamples: 1 }));
    expect(model.field('temperature', 2100).points[2].breakBefore).toBe(true);
    expect(model.field('temperature', 2100).missedSamples).toBe(1);
  });

  it('breaks stale arrival windows using the same effective-interval freshness limit', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    model.update(sample({ sampleSequence: 2, receivedMonotonicMs: 5100 }));
    expect(model.field('temperature', 5100).points[1].breakBefore).toBe(true);
    model.update(sample({ sampleSequence: 3, receivedMonotonicMs: 11000,
      effectiveIntervalMs: 5000 }));
    expect(model.field('temperature', 11000).points[2].breakBefore).toBe(false);
    model.update(sample({ sampleSequence: 4, receivedMonotonicMs: 26000,
      effectiveIntervalMs: 5000 }));
    expect(model.field('temperature', 26000).points[3].breakBefore).toBe(true);
  });

  it('retains each field timestamp and breaks on omitted or invalid measurements', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    model.update(sample({ sampleSequence: 2, receivedMonotonicMs: 1100, values: {} }));
    model.update(sample({ sampleSequence: 3, receivedMonotonicMs: 2100,
      values: { temperature: Number.NaN } }));
    expect(model.field('temperature', 2100)).toMatchObject({ value: 24, ageMs: 2000 });
    model.update(sample({ sampleSequence: 4, receivedMonotonicMs: 3100 }));
    expect(model.field('temperature', 3100).points.map(point => point.breakBefore)).toEqual([false, true]);
  });

  it('keeps other scalar values visible but curves only finite safe numeric data', () => {
    const model = new TelemetryPresentation();
    const unsafeInteger = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    model.update(sample({ values: { flag: true, text: 'on', safe: 42n,
      unsafe: unsafeInteger, infinite: Infinity } }));
    expect(model.field('flag', 100)).toMatchObject({ value: true, status: 'fresh', points: [] });
    expect(model.field('text', 100).points).toEqual([]);
    expect(model.field('safe', 100).points[0].value).toBe(42);
    expect(model.field('unsafe', 100)).toMatchObject({ value: unsafeInteger, points: [] });
    expect(model.field('infinite', 100).status).toBe('waiting');
  });

  it('clones byte values on ingress and read, without producing a numeric curve', () => {
    const model = new TelemetryPresentation();
    const bytes = new Uint8Array([1, 2]);
    model.update(sample({ values: { bytes } }));
    bytes[0] = 99;
    const visible = model.field('bytes', 100).value as Uint8Array;
    expect(visible).toEqual(new Uint8Array([1, 2]));
    visible[0] = 88;
    expect(model.field('bytes', 100).value).toEqual(new Uint8Array([1, 2]));
  });

  it('caps every series at 300 recent points and the entire page at 32 fields', () => {
    const model = new TelemetryPresentation();
    const values = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`field${index}`, index]));
    for (let index = 1; index <= 305; ++index) {
      model.update(sample({ sampleSequence: index, receivedMonotonicMs: index * 1000, values }));
    }
    expect(model.field('field0', 305000).points).toHaveLength(TELEMETRY_CHART_MAX_POINTS);
    expect(model.field('field0', 305000).points[0].receivedMonotonicMs).toBe(6000);
    expect(model.field(`field${TELEMETRY_PRESENTATION_MAX_FIELDS - 1}`, 305000).points).toHaveLength(300);
    expect(model.field(`field${TELEMETRY_PRESENTATION_MAX_FIELDS}`, 305000).points).toEqual([]);
  });

  it('clears old values/curves for a new epoch, stream or carrier', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    for (const change of [{ epoch: 4 }, { epoch: 4, streamId: 5 },
      { epoch: 4, streamId: 5, source: 'ble' as const }]) {
      model.update(sample({ ...change, sampleSequence: undefined, receivedMonotonicMs: undefined,
        values: {} }));
      expect(model.field('temperature', 1100)).toMatchObject({ status: 'waiting',
        value: undefined, points: [] });
      model.update(sample({ ...change, receivedMonotonicMs: 1100 }));
      expect(model.field('temperature', 1100).points).toHaveLength(1);
    }
  });

  it('marks stopped streams without appending or pretending the last sample is fresh', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    model.update(sample({ active: false, sampleSequence: 2,
      receivedMonotonicMs: 1000, values: { temperature: 99 } }));
    expect(model.field('temperature', 6000)).toMatchObject({ status: 'stopped', value: undefined,
      ageMs: 5900 });
    expect(model.field('temperature', 6000).points).toHaveLength(1);
    model.reset();
    expect(model.field('temperature', 6000)).toMatchObject({ status: 'stopped',
      value: undefined, source: undefined, points: [] });
  });

  it('rejects invalid identities/times and does not reverse the curve clock', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    for (const change of [{ sampleSequence: 0 }, { sampleSequence: -1 },
      { sampleSequence: 0x100000000 }, { sampleSequence: 1.5 },
      { sampleSequence: 2, receivedMonotonicMs: Infinity },
      { sampleSequence: 2, receivedMonotonicMs: -1 },
      { sampleSequence: 2, receivedMonotonicMs: 99 }]) {
      model.update(sample({ ...change, values: { temperature: 99 } }));
    }
    expect(model.field('temperature', 100)).toMatchObject({ value: 24, ageMs: 0 });
    expect(model.field('temperature', 100).points).toHaveLength(1);
  });

  it('formats actual frequency, sample freshness and the real source separately', () => {
    const model = new TelemetryPresentation();
    model.update(sample());
    expect(telemetryIntervalLabel(1000)).toBe('实际 1 秒/次');
    expect(telemetryIntervalLabel(250)).toBe('实际 0.25 秒/次');
    expect(telemetryIntervalLabel(NaN)).toBe('等待确认采样间隔');
    expect(telemetrySourceLabel('cloud')).toBe('云端 MQTT');
    expect(telemetrySourceLabel('ble')).toBe('蓝牙直连');
    expect(telemetrySourceLabel('lan')).toBe('局域网直连');
    expect(telemetryFreshnessLabel(model.field('missing-field', 100))).toBe('等待首次数据');
    expect(telemetryFreshnessLabel(model.field('temperature', 100))).toBe('刚刚更新');
    expect(telemetryFreshnessLabel(model.field('temperature', 2100))).toBe('2 秒前更新');
    expect(telemetryFreshnessLabel(model.field('temperature', 6100))).toBe('数据陈旧 · 6 秒前更新');
  });
});
