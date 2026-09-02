import { describe, expect, it, vi } from 'vitest';

import {
  APP_FEATURES,
  Bbp2FrameFlag,
  Bbp2MessageKind,
  Bbp2RoutePeerKind,
  DeviceV2EndpointKind,
  DeviceV2Store,
  DeviceV2TelemetryOperation,
  DeviceV2TelemetryStatusCode,
  DeviceV2ValueType,
  bytesToHex,
  decodeDeliveryBody,
  decodeEventBody,
  decodeFrame,
  decodeManifestPageBody,
  decodePatchBody,
  decodeServerHelloBody,
  decodeStatePageBody,
  decodeTelemetryDataBody,
  decodeTelemetryStatusBody,
  encodeDeliveryBody,
  encodeAppHelloBody,
  encodeCommandBody,
  encodeFrame,
  encodeManifestAcceptBody,
  encodeManifestRequestBody,
  encodeRouteBody,
  encodeStateRequestBody,
  encodeTelemetryControlBody,
  hexToBytes,
  logicalDevicePeerId,
  peerIdToLogicalDevice,
} from './index';

const logicalDeviceId = 'device_01234567-89ab-cdef-0123-456789abcdef';
const bleLogicalDeviceId = 'ble_AAECAwQFBgcICQoLDA0ODw';
const fingerprintHex = '4c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf';
const manifestPageHex = 'a600010158204c765bdde27719d7beac22883b160c8b592b22d94844cd90911d3ec6c66a9dbf0200030204020582a50065706f7765720100020003030401a50065616c61726d0102020003080402';

function bytes(value: string): Uint8Array {
  return hexToBytes(value);
}

describe('Device V2 App codec', () => {
  it('matches the server App HELLO and frame golden bytes', () => {
    const hello = encodeAppHelloBody();
    expect(bytesToHex(hello)).toBe('a6000101810202191cc303190200041902000904');
    expect(APP_FEATURES).toBe(0x1cc3);

    const frame = encodeFrame({
      kind: Bbp2MessageKind.Hello,
      flags: Bbp2FrameFlag.AckRequired,
      sequence: 1,
      body: hello,
    });
    expect(decodeFrame(frame)).toEqual({
      kind: Bbp2MessageKind.Hello,
      flags: Bbp2FrameFlag.AckRequired,
      sequence: 1,
      body: hello,
    });
    expect(() => decodeFrame(frame.subarray(0, frame.length - 1))).toThrow(/length|header/);

    const extended = new Uint8Array(frame.length + 2);
    extended.set(frame.subarray(0, 10));
    extended[5] = 12;
    extended.set([0xaa, 0x55], 10);
    extended.set(frame.subarray(10), 12);
    expect(decodeFrame(extended).body).toEqual(hello);
    expect(() => decodeFrame(new Uint8Array(513))).toThrow(/header/);

    expect(decodeServerHelloBody(bytes(
      'a6000201810202190cc303190200041902000904',
    ))).toEqual({
      role: 2,
      versions: [2],
      // Presence is additive: old Brokers can negotiate the 0x0cc3 subset.
      features: 0x0cc3,
      maxFrameSize: 512,
      maxReassemblySize: 512,
      reliableReceiveWindow: 4,
    });
    expect(() => decodeServerHelloBody(bytes(
      'a600020181020218c303190200041902000904',
    ))).toThrow(/negotiation/);
  });

  it('matches the frozen telemetry control/status/data bytes', () => {
    expect(bytesToHex(encodeTelemetryControlBody({
      operation: DeviceV2TelemetryOperation.Open,
      streamId: 1,
      leaseMs: 30000,
      intervalMs: 100,
      fieldIds: [1, 2],
    }))).toBe('a5000001010319753004186405820102');
    expect(() => encodeTelemetryControlBody({
      operation: DeviceV2TelemetryOperation.Open,
      streamId: 1,
      leaseMs: 30000,
      intervalMs: 100,
      fieldIds: [2, 1],
    })).toThrow(/field IDs/);

    expect(decodeTelemetryStatusBody(bytes('a500010102020003186404197530'))).toEqual({
      streamId: 1,
      epoch: 2,
      status: DeviceV2TelemetryStatusCode.Opened,
      effectiveIntervalMs: 100,
      leaseMs: 30000,
    });
    const fields = [{
      key: 'power',
      kind: DeviceV2EndpointKind.Property,
      type: DeviceV2ValueType.Boolean,
      access: 5,
      id: 1,
      telemetryMinimumIntervalMs: 1000,
    }];
    expect(decodeTelemetryDataBody(
      bytes('a5000101010201030004a101f5'),
      fields,
    )).toEqual({
      streamId: 1,
      epoch: 1,
      sampleSequence: 1,
      monotonicMs: 0,
      values: {
        power: { type: DeviceV2ValueType.Boolean, value: true, cbor: bytes('f5') },
      },
    });
  });

  it('encodes Route metadata and converts canonical logical device identities', () => {
    const peerId = logicalDevicePeerId(logicalDeviceId);
    expect(bytesToHex(peerId)).toBe('0123456789abcdef0123456789abcdef');
    expect(peerIdToLogicalDevice(peerId)).toBe(logicalDeviceId);
    expect(logicalDevicePeerId(bleLogicalDeviceId)).toEqual(Uint8Array.from(
      { length: 16 }, (_, index) => index,
    ));
    expect(() => logicalDevicePeerId('ble_AAECAwQFBgcICQoLDA0ODx')).toThrow(/identity/);

    const route = encodeRouteBody({
      peerKind: Bbp2RoutePeerKind.LogicalDevice,
      peerId,
      requestId: bytes('1112131415161718191a1b1c1d1e1f20'),
      messageKind: Bbp2MessageKind.Command,
      messageFlags: Bbp2FrameFlag.AckRequired | Bbp2FrameFlag.IdMode,
      messageBody: bytes('a101f5'),
    });
    expect(bytesToHex(route)).toBe(
      'a6000001500123456789abcdef0123456789abcdef02501112131415161718191a1b1c1d1e1f200312040505a101f5',
    );
    expect(() => logicalDevicePeerId('not-a-device')).toThrow(/identity/);
  });

  it('uses the shared store for canonical BLE logical identities', () => {
    const store = new DeviceV2Store();
    expect(store.snapshot(bleLogicalDeviceId)).toMatchObject({
      manifest: null,
      stateFresh: false,
    });
  });

  it('decodes unsolicited Event Delivery without requestId', () => {
    const encoded = bytes('a5000001500123456789abcdef0123456789abcdef0313040405a102f5');
    const delivery = decodeDeliveryBody(encoded);
    expect(delivery.requestId).toBeUndefined();
    expect(delivery.messageKind).toBe(Bbp2MessageKind.Event);
    expect(delivery.messageFlags).toBe(Bbp2FrameFlag.IdMode);
    expect(peerIdToLogicalDevice(delivery.peerId)).toBe(logicalDeviceId);
    expect(encodeDeliveryBody(delivery)).toEqual(encoded);
  });

  it('decodes the server manifest/state/patch/event golden bytes', () => {
    const manifest = decodeManifestPageBody(bytes(manifestPageHex));
    expect(bytesToHex(manifest.fingerprint)).toBe(fingerprintHex);
    expect(manifest.fields.map(field => [field.key, field.kind, field.id])).toEqual([
      ['power', DeviceV2EndpointKind.Property, 1],
      ['alarm', DeviceV2EndpointKind.Event, 2],
    ]);

    const first = decodeStatePageBody(
      bytes('a5000201000201030204a101f4'),
      manifest.fields,
    );
    const second = decodeStatePageBody(
      bytes('a5000201010202030204a0'),
      manifest.fields,
    );
    expect(first.values['power']?.value).toBe(false);
    expect(second.values).toEqual({});

    const patch = decodePatchBody(bytes('a30000010302a101f5'), manifest.fields);
    expect(patch.revision).toBe(3);
    expect(patch.values['power']?.value).toBe(true);
    const event = decodeEventBody(bytes('a102f5'), manifest.fields);
    expect(event.values['alarm']?.value).toBe(true);
    expect(() => decodeEventBody(bytes('a101f5'), manifest.fields)).toThrow(/manifest/);
  });

  it('parses realtime capability and advertises the completed telemetry lane', () => {
    const pageHex = `a60001015820${'00'.repeat(32)}`
      + '0200030104010581a6006b74656d706572617475726501000203030504010b1903e8';
    const page = decodeManifestPageBody(bytes(pageHex));
    expect(page.fields[0]?.telemetryMinimumIntervalMs).toBe(1000);
    expect(APP_FEATURES & (1 << 11)).toBe(1 << 11);
    expect(() => decodeManifestPageBody(bytes(pageHex.replace('030504', '030704'))))
      .toThrow(/telemetry/);
  });

  it('encodes request bodies and typed command values without JSON', () => {
    expect(bytesToHex(encodeManifestRequestBody(0))).toBe('a10000');
    expect(bytesToHex(encodeManifestAcceptBody(1, bytes(fingerprintHex)))).toBe(
      `a20001015820${fingerprintHex}`,
    );
    expect(bytesToHex(encodeStateRequestBody(0))).toBe('a10000');
    expect(bytesToHex(encodeStateRequestBody(1, 2))).toBe('a200010102');
    expect(bytesToHex(encodeCommandBody({
      key: 'power',
      kind: DeviceV2EndpointKind.Property,
      type: DeviceV2ValueType.Boolean,
      access: 3,
      id: 1,
    }, true))).toBe('a101f5');
  });
});

describe('DeviceV2Store', () => {
  it('verifies Manifest, commits paged state atomically, and reduces Patch/Event separately', async () => {
    const store = new DeviceV2Store();
    const stateUpdates = vi.fn();
    const events = vi.fn();
    store.subscribe(stateUpdates);
    store.subscribeEvents(events);

    const manifestPage = decodeManifestPageBody(bytes(manifestPageHex));
    const manifestResult = await store.applyManifestPage(logicalDeviceId, manifestPage);
    expect(manifestResult.complete).toBe(true);
    expect(store.snapshot(logicalDeviceId).manifestAccepted).toBe(false);

    store.markManifestAccepted(logicalDeviceId, 1, fingerprintHex);
    expect(store.applyEvent(
      logicalDeviceId,
      decodeEventBody(bytes('a102f5'), manifestPage.fields),
    )).toBe(true);
    expect(events).toHaveBeenCalledOnce();
    expect(store.snapshot(logicalDeviceId).stateRevision).toBeNull();

    store.beginState(logicalDeviceId);
    const first = store.applyStatePage(logicalDeviceId, decodeStatePageBody(
      bytes('a5000201000201030204a101f4'),
      manifestPage.fields,
    ));
    expect(first).toEqual({ complete: false, nextCursor: 1, revision: 2 });
    expect(store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    const second = store.applyStatePage(logicalDeviceId, decodeStatePageBody(
      bytes('a5000201010202030204a0'),
      manifestPage.fields,
    ));
    expect(second).toEqual({ complete: true, nextCursor: 2, revision: 2 });
    expect(store.snapshot(logicalDeviceId).values['power']?.value).toBe(false);

    const patch = decodePatchBody(bytes('a30000010302a101f5'), manifestPage.fields);
    expect(store.applyPatch(logicalDeviceId, patch)).toBe('applied');
    expect(store.snapshot(logicalDeviceId).values['power']?.value).toBe(true);
    expect(store.applyPatch(logicalDeviceId, patch)).toBe('ignored');

    const gap = decodePatchBody(bytes('a30000010502a101f4'), manifestPage.fields);
    expect(store.applyPatch(logicalDeviceId, gap)).toBe('resync');
    expect(store.snapshot(logicalDeviceId).stateFresh).toBe(false);
    expect(store.snapshot(logicalDeviceId).values['power']?.value).toBe(true);

    store.resetSession();
    const disconnected = store.snapshot(logicalDeviceId);
    expect(disconnected.manifestAccepted).toBe(false);
    expect(disconnected.eventInterrupted).toBe(true);
    expect(store.applyEvent(
      logicalDeviceId,
      decodeEventBody(bytes('a102f5'), manifestPage.fields),
    )).toBe(false);
    expect(stateUpdates).toHaveBeenCalled();

    store.clear();
    expect(store.snapshot(logicalDeviceId).manifest).toBeNull();
    expect(stateUpdates.mock.lastCall?.[1].manifest).toBeNull();
  });

  it('rejects a Manifest whose advertised fingerprint does not match its fields', async () => {
    const store = new DeviceV2Store();
    const page = decodeManifestPageBody(bytes(manifestPageHex));
    page.fingerprint[0] ^= 0xff;

    await expect(store.applyManifestPage(logicalDeviceId, page)).rejects.toThrow(/fingerprint/);
    expect(store.snapshot(logicalDeviceId).manifest).toBeNull();
  });
});
