import { describe, expect, it } from 'vitest';

import type { CustomDataOptions, CustomDataResult } from 'capacitor-wifiprov';

import { CapacitorEsp32ProvisioningTransport } from './capacitor-esp32-wifiprov.transport';

class FakeCustomEndpointClient {
  request?: CustomDataOptions;

  constructor(private readonly response: Partial<CustomDataResult>) {}

  async sendCustomData(options: CustomDataOptions): Promise<CustomDataResult> {
    this.request = options;
    return {
      data: '',
      encoding: 'base64',
      base64: '',
      ...this.response,
    };
  }
}

describe('Capacitor ESP32 provisioning transport', () => {
  it('relays exact bytes through the plugin Base64 boundary', async () => {
    const client = new FakeCustomEndpointClient({ base64: 'AgMA' });
    const transport = new CapacitorEsp32ProvisioningTransport(client);

    await expect(transport.request(
      'blinker-config/2',
      Uint8Array.of(2, 1),
    )).resolves.toEqual(Uint8Array.of(2, 3, 0));
    expect(client.request).toEqual({
      endpoint: 'blinker-config/2',
      data: 'AgE=',
      encoding: 'base64',
    });
  });

  it('rejects invalid endpoints, empty payloads, and malformed responses', async () => {
    const client = new FakeCustomEndpointClient({ base64: 'not base64' });
    const transport = new CapacitorEsp32ProvisioningTransport(client);

    await expect(transport.request('', Uint8Array.of(1))).rejects.toThrow(/endpoint/);
    await expect(transport.request('blinker-config/2', new Uint8Array()))
      .rejects.toThrow(/empty/);
    await expect(transport.request('blinker-config/2', Uint8Array.of(1)))
      .rejects.toThrow(/Base64/);
  });
});
