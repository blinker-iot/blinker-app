import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DeviceImageVariant = 'light' | 'dark';

export interface DeviceImageAsset {
  name: string;
  dark: string;
  light: string;
  keywords: string[];
}

export interface DeviceImageSource {
  dark: string;
  light: string;
}

const DEVICE_IMAGE_INDEX = 'devices/index.json';
const DEVICE_IMAGE_ROOT = 'devices/';
const UNKNOWN_IMAGE: DeviceImageSource = {
  dark: `${DEVICE_IMAGE_ROOT}home-living/unknown-device-dark.webp`,
  light: `${DEVICE_IMAGE_ROOT}home-living/unknown-device-light.webp`,
};

const LEGACY_IMAGE_ALIASES: Record<string, string> = {
  unknown: 'unknown-device',
  ownlight: 'smart-bulb',
  ownlight2: 'smart-bulb',
  ownlight3: 'smart-bulb',
  ownlight4: 'smart-bulb',
  ownbulb: 'smart-bulb',
  airconditioner: 'air-conditioner',
  humidifier: 'humidifier',
  hygrothermograph: 'thermostat',
  plant1: 'soil-moisture-sensor',
  plant2: 'soil-moisture-sensor',
  plant3: 'soil-moisture-sensor',
  esp32: 'esp32',
  ownairdetector: 'air-quality-sensor',
  ownplug: 'smart-plug',
  fan: 'pedestal-fan',
};

@Injectable({ providedIn: 'root' })
export class ImageService {
  readonly loader = new BehaviorSubject(false);

  deviceImages: DeviceImageAsset[] = [];
  loadError = false;

  private readonly imageLookup = new Map<string, DeviceImageAsset>();
  private loadingStarted = false;

  constructor(private readonly http: HttpClient) {}

  init(): void {
    if (this.loadingStarted) return;
    this.loadingStarted = true;

    this.http
      .get<DeviceImageAsset[]>(
        `${DEVICE_IMAGE_INDEX}?date=${new Date().getTime()}`,
      )
      .subscribe({
        next: (images) => {
          this.deviceImages = Array.isArray(images)
            ? images.filter((image) => this.isValidAsset(image))
            : [];
          this.buildLookup();
          this.loader.next(true);
        },
        error: () => {
          this.loadError = true;
          this.loader.next(true);
        },
      });
  }

  resolveDeviceImage(reference?: string | null): DeviceImageSource {
    if (!reference) return UNKNOWN_IMAGE;
    if (this.isRemoteUrl(reference)) return { dark: reference, light: reference };

    const asset = this.findDeviceImage(reference);
    if (asset) return this.sourceFromAsset(asset);

    const pathSource = this.sourceFromPublicPath(reference);
    return pathSource || UNKNOWN_IMAGE;
  }

  findDeviceImage(reference?: string | null): DeviceImageAsset | undefined {
    if (!reference) return undefined;

    const key = this.normalizeReference(reference);
    const directMatch = this.imageLookup.get(key);
    if (directMatch) return directMatch;

    const alias = LEGACY_IMAGE_ALIASES[key];
    return alias ? this.imageLookup.get(alias) : undefined;
  }

  getPublicImageUrl(path: string): string {
    if (this.isRemoteUrl(path)) return path;
    return `${DEVICE_IMAGE_ROOT}${this.cleanPublicPath(path)}`;
  }

  private buildLookup(): void {
    this.imageLookup.clear();
    for (const image of this.deviceImages) {
      const references = [
        image.name,
        image.dark,
        image.light,
        this.getImageStem(image.dark),
        this.getImageStem(image.light),
        ...image.keywords.slice(0, 2),
      ];
      for (const reference of references) {
        this.imageLookup.set(this.normalizeReference(reference), image);
      }
    }
  }

  private sourceFromAsset(asset: DeviceImageAsset): DeviceImageSource {
    return {
      dark: this.getPublicImageUrl(asset.dark),
      light: this.getPublicImageUrl(asset.light),
    };
  }

  private sourceFromPublicPath(reference: string): DeviceImageSource | null {
    const cleanPath = this.cleanPublicPath(reference);
    if (!cleanPath.toLowerCase().endsWith('.webp')) return null;

    const light = cleanPath.replace(/-dark\.webp$/i, '-light.webp');
    const dark = cleanPath.replace(/-light\.webp$/i, '-dark.webp');
    return {
      dark: this.getPublicImageUrl(dark),
      light: this.getPublicImageUrl(light),
    };
  }

  private cleanPublicPath(path: string): string {
    return path
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\//, '')
      .replace(/^public\//i, '')
      .replace(/^devices\//i, '');
  }

  private normalizeReference(reference: string): string {
    const normalized = this.cleanPublicPath(reference).toLowerCase();
    return normalized.includes('/')
      ? normalized
      : normalized.replace(/\.(png|webp)$/i, '');
  }

  private getImageStem(path: string): string {
    const filename = this.cleanPublicPath(path).split('/').pop() || '';
    return filename.replace(/-(dark|light)\.webp$/i, '').replace(/\.webp$/i, '');
  }

  private isRemoteUrl(path: string): boolean {
    return /^https?:\/\//i.test(path);
  }

  private isValidAsset(image: DeviceImageAsset): boolean {
    return !!(
      image &&
      typeof image.name === 'string' &&
      typeof image.dark === 'string' &&
      typeof image.light === 'string' &&
      Array.isArray(image.keywords)
    );
  }

  getBase64Image(imgPath: string, type = 'icon') {
    const img = new Image();
    img.crossOrigin = '';
    img.src = imgPath;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (type === 'icon') {
      ctx?.drawImage(img, 0, 0, 200, 200);
    } else {
      ctx?.drawImage(img, 0, 0, img.width, img.height);
    }

    return canvas.toDataURL('image/png');
  }
}
