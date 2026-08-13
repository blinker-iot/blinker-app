import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  AndroidShortcuts,
  ShortcutItem,
} from 'capacitor-android-shortcuts';

import { BlinkerDevice } from '../model/device.model';
import { environment } from '../../../environments/environment';
import { ImageService } from './image.service';
import { createDeviceDeepLink } from './device-deep-link';

export type PinDeviceShortcutResult =
  | 'requested'
  | 'unsupported'
  | 'unavailable';

@Injectable({ providedIn: 'root' })
export class DeviceShortcutService {
  constructor(private readonly imageService: ImageService) {}

  get isAvailable(): boolean {
    return this.isNativeAndroid || !environment.production;
  }

  async pinDevice(device: BlinkerDevice): Promise<PinDeviceShortcutResult> {
    if (!this.isAvailable || !device?.id) return 'unavailable';
    if (!this.isNativeAndroid) return 'unsupported';

    const support = await AndroidShortcuts.isPinnedSupported();
    if (!support.result) return 'unsupported';

    const imageUrl = this.imageService.resolveDeviceImage(
      device.config?.image,
    ).light;
    const icon = await this.createPngDataUrl(imageUrl);
    const label = device.config?.customName?.trim() || device.id;
    const shortcut: ShortcutItem = {
      id: `device:${device.id}`,
      shortLabel: label,
      longLabel: `打开设备 ${label}`,
      icon: { type: 'Bitmap', name: icon },
      data: createDeviceDeepLink(device.id),
    };

    const result = await AndroidShortcuts.pin(shortcut);
    return result.result ? 'requested' : 'unsupported';
  }

  private get isNativeAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  private async createPngDataUrl(source: string): Promise<string> {
    const image = await this.loadImage(source);
    const size = 192;
    const padding = 16;
    const drawableSize = size - padding * 2;
    const scale = Math.min(
      drawableSize / image.naturalWidth,
      drawableSize / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成快捷方式图标');

    context.clearRect(0, 0, size, size);
    context.drawImage(
      image,
      Math.round((size - width) / 2),
      Math.round((size - height) / 2),
      width,
      height,
    );
    return canvas.toDataURL('image/png');
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    const url = new URL(source, document.baseURI).href;
    return this.loadImageUrl(url).catch(async (error) => {
      if (!/^https?:\/\//i.test(url)) throw error;

      const response = await CapacitorHttp.get({
        url,
        responseType: 'blob',
        connectTimeout: 15_000,
        readTimeout: 15_000,
      });
      if (response.status < 200 || response.status >= 300) throw error;

      const contentType =
        response.headers['content-type'] ||
        response.headers['Content-Type'] ||
        'image/png';
      return this.loadImageUrl(
        `data:${contentType};base64,${String(response.data)}`,
      );
    });
  }

  private loadImageUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('无法读取设备图片'));
      image.src = url;
    });
  }
}
