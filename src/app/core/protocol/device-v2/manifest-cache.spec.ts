import { describe, expect, it } from 'vitest';
import { bytesToHex, decodeCachedManifest, decodeManifestPageBody, encodeCanonicalArray,
  encodeCanonicalByteString, encodeCanonicalMap, encodeCanonicalUnsigned, hexToBytes } from './codec';
import { decodeDirectDeviceHelloBody } from './direct-hello';
import { DeviceV2Manifest, DeviceV2ManifestField } from './types';

describe('Direct Manifest cache canonical contract', () => {
  const u = encodeCanonicalUnsigned;
  const hello = (extra: Array<[number, Uint8Array]>) => encodeCanonicalMap([
    [0, u(0)], [1, encodeCanonicalArray([u(2)])], [2, u(0xe3)], [3, u(512)], [4, u(512)],
    ...extra, [8, encodeCanonicalArray([u(2)])], [9, u(4)],
  ]);
  it('retains the optional paired Hello summary, but does not invent one for older firmware', () => {
    const fingerprint = new Uint8Array(32).fill(19);
    expect(decodeDirectDeviceHelloBody(hello([[6, u(3)], [7, encodeCanonicalByteString(fingerprint)]]), 'controller').manifest)
      .toEqual({ revision: 3, fingerprint: bytesToHex(fingerprint) });
    expect(decodeDirectDeviceHelloBody(hello([]), 'controller').manifest).toBeUndefined();
    expect(() => decodeDirectDeviceHelloBody(hello([[6, u(3)]]), 'controller')).toThrow();
    expect(() => decodeDirectDeviceHelloBody(hello([[7, encodeCanonicalByteString(fingerprint)]]), 'controller')).toThrow();
  });

  it('reconstructs existing frozen device/server bytes exactly', () => {
    const page = decodeManifestPageBody(hexToBytes(
      'a600010158204c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf0200030204020582a50065706f7765720100020003030401a50065616c61726d0102020003080402',
    ));
    expect(decodeCachedManifest({ revision: page.revision, fingerprint: bytesToHex(page.fingerprint), fields: page.fields }))
      .toEqual(page);
  });

  const manifest = (fields: DeviceV2ManifestField[]): DeviceV2Manifest => ({ revision: 2, fingerprint: 'ab'.repeat(32), fields });
  it('preserves float64 constraints, enum, telemetry and all 256 endpoint slots', () => {
    const fields: DeviceV2ManifestField[] = [
      { id: 1, key: 'temperature', kind: 0, type: 4, access: 1, telemetryMinimumIntervalMs: 100,
        constraints: { minimum: -1.5, maximum: 100, step: 0.25, unit: '℃' } },
      { id: 2, key: 'mode', kind: 0, type: 5, access: 3, constraints: { maxLength: 12, enumValues: ['auto', 'manual'] } },
      ...Array.from({ length: 254 }, (_, index) => ({ id: index + 3, key: `power${index}`, kind: 0, type: 0, access: 3 })),
    ];
    const page = decodeCachedManifest(manifest(fields));
    expect(page.fields).toEqual(fields); expect(page.totalFields).toBe(256);
    expect(bytesToHex(page.encodedFields[0])).toContain('05fbbff8000000000000');
    expect(() => decodeCachedManifest(manifest([...fields, fields[0]]))).toThrow();
  });

  it.each([
    { id: 2 }, { type: 20 }, { kind: 3 }, { access: 8 },
    { constraints: { minimum: 0 } }, { telemetryMinimumIntervalMs: 100 },
    { key: 'x'.repeat(65) },
  ])('rejects cache fields using the same wire rules: %j', patch => {
    expect(() => decodeCachedManifest(manifest([{ id: 1, key: 'power', kind: 0, type: 0, access: 3, ...patch }]))).toThrow();
  });
});
