import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { DeviceUiEndpoint } from '../device-v2/device-ui.port';
import { PageLayout, parsePageLayout } from '../device-v2/page-layout';
import { GatewayHttpError } from '../model/response.model';

export interface DeviceV2PageLayoutRecord {
  logicalDeviceId: string;
  revision: number;
  manifestFingerprint: string;
  layout: PageLayout;
  createdAt: number;
  updatedAt: number;
}

interface PageLayoutResponse {
  status: number;
  data: DeviceV2PageLayoutRecord;
}

interface PageLayoutDeleteResponse {
  status: number;
  data: { logicalDeviceId: string; deleted: true; revision: number };
}

@Injectable({ providedIn: 'root' })
export class DeviceV2PageLayoutService {
  constructor(private readonly http: HttpClient) {}

  async get(logicalDeviceId: string): Promise<DeviceV2PageLayoutRecord | null> {
    const id = this.deviceId(logicalDeviceId);
    try {
      const response = await firstValueFrom(this.http.get<PageLayoutResponse>(
        API.DEVICE_V2.PAGE_LAYOUT(id),
        { observe: 'response' },
      ));
      return this.record(this.body(response.body, response.status).data, id);
    } catch (error) {
      if (error instanceof GatewayHttpError
        && error.code === 'DEVICE_V2_PAGE_LAYOUT_NOT_FOUND') return null;
      throw error;
    }
  }

  async saveCandidate(
    logicalDeviceId: string,
    candidate: unknown,
    endpoints: readonly DeviceUiEndpoint[],
    expectedRevision: number,
  ): Promise<DeviceV2PageLayoutRecord> {
    const id = this.deviceId(logicalDeviceId);
    this.revision(expectedRevision, true);
    const layout = parsePageLayout(candidate, endpoints);
    if (layout.revision !== Math.max(1, expectedRevision)) {
      throw new Error('PageLayout base revision does not match expectedRevision');
    }
    const response = await firstValueFrom(this.http.put<PageLayoutResponse>(
      API.DEVICE_V2.PAGE_LAYOUT(id),
      { expectedRevision, layout },
      { observe: 'response' },
    ));
    return this.record(this.body(response.body, response.status).data, id);
  }

  async delete(logicalDeviceId: string, expectedRevision: number): Promise<void> {
    const id = this.deviceId(logicalDeviceId);
    this.revision(expectedRevision, false);
    const response = await firstValueFrom(this.http.delete<PageLayoutDeleteResponse>(
      API.DEVICE_V2.PAGE_LAYOUT(id),
      { body: { expectedRevision }, observe: 'response' },
    ));
    const data = this.body(response.body, response.status).data;
    if (!data.deleted || data.logicalDeviceId !== id || data.revision !== expectedRevision) {
      throw new Error('PageLayout delete response is invalid');
    }
  }

  private record(value: DeviceV2PageLayoutRecord, logicalDeviceId: string): DeviceV2PageLayoutRecord {
    if (!value || value.logicalDeviceId !== logicalDeviceId
      || !Number.isSafeInteger(value.revision) || value.revision < 1
      || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt)) {
      throw new Error('PageLayout response is invalid');
    }
    const layout = parsePageLayout(value.layout);
    if (layout.revision !== value.revision
      || layout.manifestFingerprint !== value.manifestFingerprint) {
      throw new Error('PageLayout response metadata is inconsistent');
    }
    return { ...value, layout };
  }

  private body<T extends { status: number; data: unknown }>(body: T | null, status: number): T {
    if (!body?.data || body.status !== status) throw new Error('PageLayout response is invalid');
    return body;
  }

  private deviceId(value: string): string {
    if (!value || value !== value.trim() || value.includes('\0') || value.includes('/')) {
      throw new Error('Device V2 identifier is invalid');
    }
    return value;
  }

  private revision(value: number, allowZero: boolean): void {
    const maximum = allowZero ? 0x7ffffffe : 0x7fffffff;
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > maximum) {
      throw new Error('PageLayout revision is invalid');
    }
  }

}
