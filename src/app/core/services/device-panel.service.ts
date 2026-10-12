import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from '../../configs/api.config';
import { LegacyBinding, readLegacyPanel, writeLegacyPanel } from '../device-v2/legacy-panel';
import { PanelDocument } from '../device-v2/panel-document';
import { BlinkerDevice } from '../model/device.model';
import { GatewayHttpError } from '../model/response.model';

export interface DevicePanelRecord {
  panelId: string;
  revision: number;

  panel: {
    device: { protocol: string; source: string; key: string };
    document: PanelDocument;
    bindings: Record<string, LegacyBinding>;
    view: 'normal' | 'debug';
  };

  createdAt: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class DevicePanelService {
  constructor(private readonly http: HttpClient) {}

  async get(device: BlinkerDevice): Promise<DevicePanelRecord | null> {
    if (device.config.isPreview) return null;

    const panelId = await this.panelId(device);

    try {
      const response = await firstValueFrom(this.http.get<{ data: DevicePanelRecord }>(API.DEVICE_PANEL(panelId)));

      return this.validate(response.data, panelId, device);
    } catch (error) {
      if (error instanceof GatewayHttpError && error.code === 'DEVICE_PANEL_NOT_FOUND') return null;

      throw error;
    }
  }

  async save(device: BlinkerDevice, document: PanelDocument, bindings: Record<string, LegacyBinding>,
    expectedRevision: number, view: 'normal' | 'debug' = 'normal'): Promise<DevicePanelRecord> {
    const panelId = await this.panelId(device);

    const panel: DevicePanelRecord['panel'] = {
      device: this.reference(device), document, bindings, view,
    };

    if (device.config.isPreview) {
      const timestamp = Date.now();

      return this.validate({ panelId, revision: expectedRevision + 1, panel, createdAt: timestamp, updatedAt: timestamp }, panelId, device);
    }

    const response = await firstValueFrom(this.http.put<{ data: DevicePanelRecord }>(API.DEVICE_PANEL(panelId), { expectedRevision, panel }));

    return this.validate(response.data, panelId, device);
  }
  install(device: BlinkerDevice, record: DevicePanelRecord): void {
    // In-memory cache and import backup only. New layouts are saved by the panel API.
    device.config.layouter = writeLegacyPanel(device.config.layouter, record.panel.document, record.panel.bindings);
    device.config.component = record.panel.view === 'debug' ? 'TestDashboard' : 'Layouter2Component';
  }

  async setView(device: BlinkerDevice, view: 'normal' | 'debug'): Promise<void> {
    const saved = await this.get(device);
    const imported = saved ? { document: saved.panel.document, bindings: saved.panel.bindings } : readLegacyPanel(device);
    const record = await this.save(device, imported.document, imported.bindings, saved?.revision ?? 0, view);

    this.install(device, record);
    device.subject.next({ key: 'component', value: device.config.component, source: 'device-panel' });
  }

  private reference(device: BlinkerDevice) {
    return { protocol: device.config.mode, source: device.config.broker || '', key: device.deviceName };
  }

  private async panelId(device: BlinkerDevice): Promise<string> {
    const { protocol, source, key } = this.reference(device);
    const bytes = new TextEncoder().encode(JSON.stringify([protocol, source, key]));
    const hash = await crypto.subtle.digest('SHA-256', bytes);

    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private validate(record: DevicePanelRecord, panelId: string, device: BlinkerDevice): DevicePanelRecord {
    const reference = this.reference(device);

    if (!record || record.panelId !== panelId || !Number.isSafeInteger(record.revision) || record.revision < 1
      || record.panel?.device?.protocol !== reference.protocol || record.panel.device.source !== reference.source
      || record.panel.device.key !== reference.key
      || !['normal', 'debug'].includes(record.panel.view)) throw new Error('Invalid component panel response');

    const raw = writeLegacyPanel(undefined, record.panel.document, record.panel.bindings);

    readLegacyPanel({ ...device, config: { ...device.config, layouter: raw } });

    return record;
  }
}
