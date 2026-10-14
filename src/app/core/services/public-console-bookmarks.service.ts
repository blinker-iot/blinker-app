import { Inject, Injectable, signal } from '@angular/core';
import { DEVICE_CONSOLE_HOST, DeviceConsoleHost, PublicConsoleBookmark } from '../device-v2/console-host';
import { DeviceConsole, parseConsoleLink } from './device-console.service';

const MAX_BOOKMARKS = 100;

@Injectable({ providedIn: 'root' })
export class PublicConsoleBookmarksService {
  readonly items = signal<readonly PublicConsoleBookmark[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  private readonly ready: Promise<void>;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(@Inject(DEVICE_CONSOLE_HOST) private readonly host: DeviceConsoleHost) {
    this.ready = this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      this.items.set(await this.read());
    } catch {
      this.error.set('无法读取本机设备列表');
    } finally {
      this.loading.set(false);
    }
  }

  private async read(): Promise<PublicConsoleBookmark[]> {
    const saved = await this.host.readPublicDevices();

    if (!Array.isArray(saved) || saved.length > MAX_BOOKMARKS) throw new Error('Invalid local devices');

    const valid = saved.filter(
      (item): item is PublicConsoleBookmark =>
        !!item &&
        typeof item.logicalDeviceId === 'string' &&
        item.logicalDeviceId.length > 0 &&
        item.logicalDeviceId.length <= 128 &&
        typeof item.name === 'string' &&
        item.name.length > 0 &&
        item.name.length <= 256 &&
        typeof item.token === 'string' &&
        !!parseConsoleLink(`diandeng://console/${item.token}`) &&
        Number.isSafeInteger(item.savedAt) &&
        item.savedAt > 0
    );

    return [
      ...new Map(
        valid.map((item) => [
          item.logicalDeviceId,
          {
            logicalDeviceId: item.logicalDeviceId,
            name: item.name,
            token: item.token,
            savedAt: item.savedAt,
          },
        ])
      ).values(),
    ];
  }

  has(deviceId: string, token: string): boolean {
    return this.items().some((item) => item.logicalDeviceId === deviceId && item.token === token);
  }

  async add(console: DeviceConsole, token: string): Promise<void> {
    await this.ready;

    if (this.error()) throw new Error(this.error());
    if (!parseConsoleLink(`diandeng://console/${token}`)) throw new Error('链接无效');

    await this.update((items) => {
      const rest = items.filter((item) => item.logicalDeviceId !== console.logicalDeviceId);

      if (rest.length >= MAX_BOOKMARKS) throw new Error('本机设备列表已满');

      return [{ logicalDeviceId: console.logicalDeviceId, name: console.name, token, savedAt: Date.now() }, ...rest];
    });
  }

  async remove(deviceId: string): Promise<void> {
    await this.ready;

    if (this.error()) throw new Error(this.error());

    await this.update((items) => items.filter((item) => item.logicalDeviceId !== deviceId));
  }

  private update(change: (items: readonly PublicConsoleBookmark[]) => readonly PublicConsoleBookmark[]): Promise<void> {
    const next = this.pendingWrite.then(async () => {
      const items = change(await this.read());

      await this.host.writePublicDevices(items);

      this.items.set(items);
    });

    this.pendingWrite = next.catch(() => undefined);

    return next;
  }
}
