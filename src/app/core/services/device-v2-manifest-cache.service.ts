import { Injectable } from '@angular/core';

import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2Manifest,
  DeviceV2ValueType,
} from '../protocol/device-v2';
import { DataService } from './data.service';

interface StoredManifest {
  version: 1;
  logicalDeviceId: string;
  savedAt: number;
  manifest: DeviceV2Manifest;
}

const PREFIX = 'blinker-v2-manifest:';
const MAX_ENCODED_BYTES = 256 * 1024;

@Injectable({ providedIn: 'root' })
export class DeviceV2ManifestCache {
  constructor(private readonly data: DataService) {}

  load(logicalDeviceId: string): DeviceV2Manifest | undefined {
    const key = this.key(logicalDeviceId);
    if (!key) return undefined;
    try {
      const encoded = localStorage.getItem(key);
      if (!encoded || encoded.length > MAX_ENCODED_BYTES) return undefined;
      const stored = JSON.parse(encoded) as StoredManifest;
      return stored.version === 1
        && stored.logicalDeviceId === logicalDeviceId
        && this.valid(stored.manifest)
        ? this.clone(stored.manifest)
        : undefined;
    } catch {
      return undefined;
    }
  }

  save(logicalDeviceId: string, manifest: DeviceV2Manifest): void {
    const key = this.key(logicalDeviceId);
    if (!key || !this.valid(manifest)) return;
    try {
      const encoded = JSON.stringify({
        version: 1,
        logicalDeviceId,
        savedAt: Date.now(),
        manifest,
      } satisfies StoredManifest);
      if (encoded.length <= MAX_ENCODED_BYTES) localStorage.setItem(key, encoded);
    } catch {
      // Capability caching is an offline optimization, never a session prerequisite.
    }
  }

  private key(logicalDeviceId: string): string | undefined {
    const accountId = this.data.auth?.uuid || this.data.user?.id;
    if (!accountId || !logicalDeviceId || logicalDeviceId.includes('\0')) return undefined;
    return `${PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(logicalDeviceId)}`;
  }

  private valid(manifest: DeviceV2Manifest): boolean {
    if (!manifest || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0
      || !/^[0-9a-f]{64}$/.test(manifest.fingerprint)
      || !Array.isArray(manifest.fields) || manifest.fields.length > 256) return false;
    const keys = new Set<string>();
    return manifest.fields.every((field, index) => {
      if (!field || field.id !== index + 1 || typeof field.key !== 'string'
        || !field.key || field.key.length > 64 || keys.has(field.key)
        || !Object.values(DeviceV2EndpointKind).includes(field.kind)
        || !Object.values(DeviceV2ValueType).includes(field.type)
        || !Number.isSafeInteger(field.access) || field.access < 0
        || field.access > (DeviceV2EndpointAccess.Read
          | DeviceV2EndpointAccess.Write
          | DeviceV2EndpointAccess.Notify
          | DeviceV2EndpointAccess.Event
          | DeviceV2EndpointAccess.Command)) return false;
      keys.add(field.key);
      return true;
    });
  }

  private clone(manifest: DeviceV2Manifest): DeviceV2Manifest {
    return {
      revision: manifest.revision,
      fingerprint: manifest.fingerprint,
      fields: manifest.fields.map(field => ({
        ...field,
        constraints: field.constraints ? {
          ...field.constraints,
          enumValues: field.constraints.enumValues
            ? [...field.constraints.enumValues]
            : undefined,
        } : undefined,
      })),
    };
  }
}
