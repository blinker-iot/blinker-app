import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DEVICE_CONSOLE_API_BASE } from '../device-v2/console-host';
import { CustomPanelDocument, PanelMode, parseCustomPanel } from '../device-v2/custom-panel';
import { PageLayout, parsePageLayout } from '../device-v2/page-layout';
import { BlinkerDevice } from '../model/device.model';
import { DeviceV2PageLayoutRecord } from './device-v2-page-layout.service';

export interface DeviceConsole {
  logicalDeviceId: string;
  name: string;
  deviceType: string;
  revision: number;
  layout: PageLayout | null;

  uiConfig: { panelMode?: PanelMode; customPanel?: CustomPanelDocument; hiddenEndpointKeys?: string[] };

  defaultMode: PanelMode;
  availableModes: PanelMode[];
  capabilities: {
    canRead: boolean;
    canCommand: boolean;

    commandEndpointKeys: string[] | null;

    canEditConsole: boolean;
    canManageSharing: boolean;
  };
}

export interface ConsoleLink {
  token: string;
  version: number;
  state: 'active' | 'revoked';

  publicFields: string[];

  expiresAt: number | null;
}

export interface ConsoleSharingSettings {
  publicAccessEnabled: boolean;
  link: ConsoleLink | null;
}

export interface ConsoleViewSession {
  sessionToken: string;
  expiresAt: number;
  console: DeviceConsole;
}

export function cloudConsole(device?: BlinkerDevice): boolean {
  return device?.config.mode === 'bbp2' && device.cloudEnabled === true && !device.config.isPreview;
}

export function canEditConsole(device?: BlinkerDevice): boolean {
  return !!device && (!device.config.isShared || device.config.canEditConsole === true);
}

export function parseConsoleLink(value?: string | null): string | null {
  if (typeof value !== 'string') return null;

  const match = /^diandeng:\/\/console\/([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/.exec(value.trim());

  return match?.[1] ?? null;
}

export function consoleLink(token: string): string {
  const link = `diandeng://console/${token}`;

  if (!parseConsoleLink(link)) throw new Error('控制台链接无效');

  return link;
}

export function consoleLayout(record: DeviceConsole): DeviceV2PageLayoutRecord | null {
  return record.layout
    ? {
        logicalDeviceId: record.logicalDeviceId,
        revision: record.layout.revision,
        manifestFingerprint: record.layout.manifestFingerprint,
        layout: record.layout,
        createdAt: 0,
        updatedAt: 0,
      }

    : null;
}

export function installConsole(device: BlinkerDevice, record: DeviceConsole): void {
  if ((device.id || device.deviceName) !== record.logicalDeviceId) throw new Error('控制台设备不匹配');

  Object.assign(device.config, record.uiConfig, { canEditConsole: record.capabilities.canEditConsole });

  if (device.config.isShared && record.name) device.config.customName = record.name;

  device.config.customPanel = record.uiConfig.customPanel;
  device.config.hiddenEndpointKeys = record.uiConfig.hiddenEndpointKeys ?? [];
  device.data.canCommand = record.capabilities.canCommand;
  device.data.commandEndpointKeys = record.capabilities.commandEndpointKeys;
}

@Injectable({ providedIn: 'root' })
export class DeviceConsoleService {
  constructor(private readonly http: HttpClient, @Inject(DEVICE_CONSOLE_API_BASE) private readonly baseUrl: string) {}

  private consoleUrl(id: string): string {
    return `${this.baseUrl}/api/v2/devices/${encodeURIComponent(id)}/console`;
  }

  private get viewUrl(): string {
    return `${this.baseUrl}/api/v2/console-view-sessions`;
  }

  async get(id: string): Promise<DeviceConsole> {
    const result = await firstValueFrom(this.http.get<{ data: DeviceConsole }>(this.consoleUrl(id)));

    return this.record(result.data, id);
  }

  async save(
    id: string,
    change: { layout?: PageLayout; uiConfig?: DeviceConsole['uiConfig'] }
  ): Promise<DeviceConsole> {
    const response = await firstValueFrom(this.http.put<{ data: DeviceConsole }>(this.consoleUrl(id), change));

    return this.record(response.data, id);
  }

  async resolveLink(token: string): Promise<DeviceConsole> {
    const result = await firstValueFrom(this.http.post<{ data: DeviceConsole }>(
      `${this.baseUrl}/api/v2/console-links:resolve`, { token }));

    return this.record(result.data);
  }

  async getLink(id: string): Promise<ConsoleSharingSettings> {
    return (await firstValueFrom(this.http.get<{ data: ConsoleSharingSettings }>(this.consoleUrl(id) + '-link'))).data;
  }

  async setPublicAccess(id: string, enabled: boolean): Promise<{ publicAccessEnabled: boolean }> {
    return (await firstValueFrom(this.http.patch<{ data: { publicAccessEnabled: boolean } }>(
      this.consoleUrl(id) + '-public-access', { enabled }))).data;
  }

  async saveLink(
    id: string,
    input: { expectedVersion?: number; rotate?: boolean; expiresInDays?: number | null; publicFields?: string[] },
    requestKey: string
  ): Promise<ConsoleLink> {
    return (
      await firstValueFrom(
        this.http.post<{ data: ConsoleLink }>(this.consoleUrl(id) + '-link', input, {
          headers: { 'Idempotency-Key': requestKey },
        })
      )
    ).data;
  }

  async revokeLink(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.consoleUrl(id) + '-link'));
  }

  async openView(token: string): Promise<ConsoleViewSession> {
    const value = (await firstValueFrom(this.http.post<{ data: ConsoleViewSession }>(this.viewUrl, { token }))).data;

    if (
      !value ||
      !parseConsoleLink(`diandeng://console/${value.sessionToken}`) ||
      !Number.isSafeInteger(value.expiresAt)
    ) {
      throw new Error('观看会话无效');
    }

    return { ...value, console: this.record(value.console) };
  }

  async refreshView(token: string): Promise<DeviceConsole> {
    const result = await firstValueFrom(
      this.http.get<{ data: DeviceConsole }>(`${this.viewUrl}/current/console`, {
        headers: { Authorization: `ConsoleView ${token}` },
      })
    );

    return this.record(result.data);
  }

  async closeView(token: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.viewUrl}/current`, { headers: { Authorization: `ConsoleView ${token}` } })
    );
  }

  async events(token: string, signal: AbortSignal, receive: (type: string, value: unknown) => void): Promise<void> {
    const response = await fetch(`${this.viewUrl}/current/events`, {
      headers: { Authorization: `ConsoleView ${token}`, Accept: 'text/event-stream' },
      signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });

    if (!response.ok || !response.body) throw new Error('实时连接暂不可用');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal.aborted) {
        const result = await reader.read();

        if (result.done) return;

        buffer += decoder.decode(result.value, { stream: true });

        if (buffer.length > 1024 * 1024) throw new Error('实时数据过大');

        let boundary: number;

        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = message.split('\n');
          const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
          const data = lines.find((line) => line.startsWith('data: '))?.slice(6);

          if (event && data) receive(event, JSON.parse(data));
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  private record(value: DeviceConsole, expectedId?: string): DeviceConsole {
    if (
      !value ||
      !value.logicalDeviceId ||
      (expectedId && value.logicalDeviceId !== expectedId) ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0 ||
      !value.uiConfig ||
      !value.capabilities ||
      value.capabilities.canRead !== true ||
      typeof value.capabilities.canCommand !== 'boolean' ||
      typeof value.capabilities.canEditConsole !== 'boolean' ||
      !['normal', 'custom'].includes(value.defaultMode) ||
      !Array.isArray(value.availableModes)
    ) {
      throw new Error('控制台配置无效');
    }

    return {
      ...value,
      layout: value.layout ? parsePageLayout(value.layout) : null,
      uiConfig: {
        ...value.uiConfig,
        customPanel: value.uiConfig.customPanel ? parseCustomPanel(value.uiConfig.customPanel) : undefined,
      },
    };
  }
}
