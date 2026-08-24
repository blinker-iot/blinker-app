import { describe, expect, it } from 'vitest';

import {
  BLINKER_CONFIG_ENDPOINT,
  BlinkerConfigError,
  BlinkerConfigOperation,
  BlinkerConfigStatus,
  configureBlinkerAccess,
  decodeBlinkerConfigInfo,
  encodeBlinkerConfigBootstrap,
  encodeBlinkerConfigInstall,
  Esp32ProvisioningTransport,
} from './esp32-wifiprov';

const DEVICE_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

class FakeTransport implements Esp32ProvisioningTransport {
  readonly requests: Array<{ endpoint: string; payload: Uint8Array }> = [];

  constructor(private readonly responses: Uint8Array[]) {}

  async request(endpoint: string, payload: Uint8Array): Promise<Uint8Array> {
    this.requests.push({ endpoint, payload: payload.slice() });
    const response = this.responses.shift();
    if (!response) throw new Error('unexpected provisioning request');
    return response;
  }
}

function info(flags: number, accessEpoch = 0): Uint8Array {
  const response = new Uint8Array(24);
  response.set([2, BlinkerConfigOperation.GetInfo, 0, flags]);
  for (let index = 0; index < 16; index += 1) response[4 + index] = 0x10 + index;
  new DataView(response.buffer).setUint32(20, accessEpoch, false);
  return response;
}

describe('ESP32 blinker-config/2', () => {
  it('matches the exact 45-byte DeviceKey install request', () => {
    const request = encodeBlinkerConfigInstall(DEVICE_KEY);
    expect(request.length).toBe(45);
    expect([...request.slice(0, 2)]).toEqual([2, 2]);
    expect(new TextDecoder().decode(request.slice(2))).toBe(DEVICE_KEY);
  });

  it('matches the exact 101-byte access bootstrap request', () => {
    const controllerId = Uint8Array.from({ length: 16 }, (_, index) => 0x20 + index);
    const controllerSecret = Uint8Array.from({ length: 32 }, (_, index) => 0x60 + index);
    const request = encodeBlinkerConfigBootstrap(DEVICE_KEY, {
      accessEpoch: 7,
      controllerId,
      credentialVersion: 3,
      controllerSecret,
    });

    expect(request.length).toBe(101);
    expect([...request.slice(0, 2)]).toEqual([2, 3]);
    expect(new DataView(request.buffer).getUint32(45, false)).toBe(7);
    expect([...request.slice(49, 65)]).toEqual([...controllerId]);
    expect(new DataView(request.buffer).getUint32(65, false)).toBe(3);
    expect([...request.slice(69)]).toEqual([...controllerSecret]);
  });

  it('decodes the exact 24-byte device information response', () => {
    const decoded = decodeBlinkerConfigInfo(info(0x07, 9));
    expect(decoded).toEqual({
      deviceInstanceId: Uint8Array.from({ length: 16 }, (_, index) => 0x10 + index),
      accessEpoch: 9,
      hasDeviceKey: true,
      supportsAccessBootstrap: true,
      hasAccessState: true,
    });
  });

  it('chooses Bootstrap for first WiFi+BLE setup', async () => {
    const transport = new FakeTransport([
      info(0x02),
      Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0),
    ]);
    const result = await configureBlinkerAccess(transport, DEVICE_KEY, {
      accessEpoch: 1,
      controllerId: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
      credentialVersion: 1,
      controllerSecret: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    });

    expect(result.operation).toBe(BlinkerConfigOperation.Bootstrap);
    expect(transport.requests.map(request => request.endpoint)).toEqual([
      BLINKER_CONFIG_ENDPOINT,
      BLINKER_CONFIG_ENDPOINT,
    ]);
    expect(transport.requests[1].payload.length).toBe(101);
  });

  it('chooses Install when access state already exists', async () => {
    const transport = new FakeTransport([
      info(0x07, 1),
      Uint8Array.of(2, BlinkerConfigOperation.Install, 0),
    ]);
    const result = await configureBlinkerAccess(transport, DEVICE_KEY);

    expect(result.operation).toBe(BlinkerConfigOperation.Install);
    expect(transport.requests[1].payload.length).toBe(45);
  });

  it('rejects missing bootstrap and exact device error statuses', async () => {
    await expect(configureBlinkerAccess(
      new FakeTransport([info(0x02)]),
      DEVICE_KEY,
    )).rejects.toMatchObject({ status: BlinkerConfigStatus.AccessRequired });

    await expect(configureBlinkerAccess(
      new FakeTransport([
        info(0),
        Uint8Array.of(2, BlinkerConfigOperation.Install, BlinkerConfigStatus.Conflict),
      ]),
      DEVICE_KEY,
    )).rejects.toMatchObject({ status: BlinkerConfigStatus.Conflict });
  });

  it('rejects non-canonical, zero, and malformed DeviceKeys', () => {
    expect(() => encodeBlinkerConfigInstall('A'.repeat(43)))
      .toThrow(BlinkerConfigError);
    expect(() => encodeBlinkerConfigInstall(`${DEVICE_KEY.slice(0, 42)}9`))
      .toThrow(/canonical/);
    expect(() => encodeBlinkerConfigInstall(`${DEVICE_KEY}=`))
      .toThrow(/43 Base64URL/);
  });
});
