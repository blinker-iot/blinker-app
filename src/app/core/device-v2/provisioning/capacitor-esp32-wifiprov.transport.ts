import { WiFiProv } from 'capacitor-wifiprov';
import type { WiFiProvPlugin } from 'capacitor-wifiprov';

import { Esp32ProvisioningTransport } from './esp32-wifiprov';

type CustomEndpointClient = Pick<WiFiProvPlugin, 'sendCustomData'>;

export class CapacitorEsp32ProvisioningTransport
implements Esp32ProvisioningTransport {
  constructor(private readonly client: CustomEndpointClient = WiFiProv) {}

  async request(endpoint: string, payload: Uint8Array): Promise<Uint8Array> {
    if (
      !endpoint
      || endpoint !== endpoint.trim()
      || endpoint.length > 64
      || endpoint.includes('\0')
    ) {
      throw new Error('ESP32 provisioning endpoint is invalid');
    }
    if (!(payload instanceof Uint8Array) || payload.length === 0) {
      throw new Error('ESP32 provisioning payload is empty');
    }

    const response = await this.client.sendCustomData({
      endpoint,
      data: encodeBase64(payload),
      encoding: 'base64',
    });
    return decodeBase64(response.base64);
  }
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error('ESP32 provisioning response is not canonical Base64');
  }
  const binary = atob(value);
  const output = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (encodeBase64(output) !== value) {
    throw new Error('ESP32 provisioning response is not canonical Base64');
  }
  return output;
}
