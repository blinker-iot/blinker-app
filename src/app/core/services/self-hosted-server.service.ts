import { Injectable } from '@angular/core';

export interface SelfHostedServerConfig {
  address: string;
  key: string;
}

export const SELF_HOSTED_SERVER_STORAGE_KEY =
  'blinker:self-hosted-server-config';

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

@Injectable({
  providedIn: 'root',
})
export class SelfHostedServerService {
  getConfig(): SelfHostedServerConfig | null {
    try {
      const saved = localStorage.getItem(SELF_HOSTED_SERVER_STORAGE_KEY);
      if (!saved) return null;

      const config = JSON.parse(saved) as Partial<SelfHostedServerConfig>;
      const address = this.normalizeAddress(config.address ?? '');
      if (!address || typeof config.key !== 'string' || !config.key.trim()) {
        return null;
      }

      return { address, key: config.key };
    } catch {
      return null;
    }
  }

  saveConfig(address: string, key: string): SelfHostedServerConfig {
    const normalizedAddress = this.normalizeAddress(address);
    if (!normalizedAddress) {
      throw new Error('Invalid self-hosted server address');
    }
    if (!key.trim()) {
      throw new Error('Self-hosted server key is required');
    }

    const config = { address: normalizedAddress, key };
    localStorage.setItem(
      SELF_HOSTED_SERVER_STORAGE_KEY,
      JSON.stringify(config),
    );
    return config;
  }

  clearConfig(): void {
    localStorage.removeItem(SELF_HOSTED_SERVER_STORAGE_KEY);
  }

  normalizeAddress(value: string): string | null {
    const candidate = value.trim();
    if (!candidate) return null;

    try {
      const url = new URL(candidate);
      if (!SUPPORTED_PROTOCOLS.has(url.protocol) || !url.hostname) {
        return null;
      }

      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }
}
