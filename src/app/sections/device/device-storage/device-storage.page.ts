import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';

interface StoragePoint {
  time: Date;
  value: number;
}

interface StorageDataset {
  key: string;
  label: string;
  unit: string;
  icon: string;
  color: string;
  points: StoragePoint[];
}

const DATASET_META: Record<string, Omit<StorageDataset, 'key' | 'points'>> = {
  temperature: { label: '温度', unit: '°C', icon: 'fa-temperature-half', color: '#f97316' },
  temp: { label: '温度', unit: '°C', icon: 'fa-temperature-half', color: '#f97316' },
  humidity: { label: '湿度', unit: '%', icon: 'fa-droplet', color: '#0ea5e9' },
  humi: { label: '湿度', unit: '%', icon: 'fa-droplet', color: '#0ea5e9' },
  co2: { label: 'CO₂', unit: 'ppm', icon: 'fa-cloud', color: '#8b5cf6' },
  pm25: { label: 'PM2.5', unit: 'μg/m³', icon: 'fa-wind', color: '#22c55e' },
  power: { label: '功率', unit: 'W', icon: 'fa-bolt', color: '#eab308' },
};

function points(values: number[], minuteStep = 30): StoragePoint[] {
  const now = Date.now();
  return values.map((value, index) => ({
    time: new Date(now - (values.length - index - 1) * minuteStep * 60_000),
    value,
  }));
}

function createTestDatasets(): StorageDataset[] {
  return [
    {
      key: 'temperature',
      ...DATASET_META['temperature'],
      points: points([23.2, 23.6, 24.1, 24.8, 24.5, 24.6]),
    },
    {
      key: 'humidity',
      ...DATASET_META['humidity'],
      points: points([58, 57, 55, 54, 55, 56]),
    },
    {
      key: 'co2',
      ...DATASET_META['co2'],
      points: points([612, 635, 680, 724, 658, 620]),
    },
    {
      key: 'pm25',
      ...DATASET_META['pm25'],
      points: points([12, 15, 18, 21, 17, 16]),
    },
  ];
}

@Component({
  selector: 'app-device-storage',
  templateUrl: './device-storage.page.html',
  styleUrls: ['./device-storage.page.scss'],
  imports: [CommonModule, IonicModule, HeroCardComponent],
})
export class DeviceStoragePage implements OnInit, OnDestroy {
  id = '';
  device?: BlinkerDevice;
  loaded = false;
  usingTestData = false;
  datasets: StorageDataset[] = [];
  selectedKey = '';
  storageUsed = 13.6;
  storageQuota = 20;
  retentionDays = 30;

  private subscription?: Subscription;

  get defaultBackHref(): string {
    return `/device-manager/${this.id}`;
  }

  get deviceName(): string {
    return this.device?.config?.customName || '设备';
  }

  get selectedDataset(): StorageDataset | undefined {
    return this.datasets.find((dataset) => dataset.key === this.selectedKey);
  }

  get usagePercent(): number {
    if (!this.storageQuota) return 0;
    return Math.min(100, Math.round((this.storageUsed / this.storageQuota) * 100));
  }

  get totalRecords(): number {
    return this.datasets.reduce((total, dataset) => total + dataset.points.length, 0);
  }

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dataService: DataService,
  ) {}

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.paramMap.get('id') || '';
    this.bindDevice();
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) this.bindDevice();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  selectDataset(key: string): void {
    this.selectedKey = key;
  }

  latestValue(dataset: StorageDataset): number {
    return dataset.points.at(-1)?.value ?? 0;
  }

  pointPercent(point: StoragePoint, dataset: StorageDataset): number {
    const values = dataset.points.map((item) => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 65;
    return 18 + ((point.value - min) / (max - min)) * 82;
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = Boolean(this.device);
    if (!this.device) return;

    const realDatasets = this.normalizeStorage(this.device.storage);
    this.usingTestData = realDatasets.length === 0;
    this.datasets = this.usingTestData ? createTestDatasets() : realDatasets;
    this.selectedKey = this.datasets.some((dataset) => dataset.key === this.selectedKey)
      ? this.selectedKey
      : this.datasets[0]?.key || '';

    const storageInfo = this.device.data?.storageInfo;
    if (storageInfo && typeof storageInfo === 'object') {
      this.storageUsed = Number(storageInfo.used) || this.storageUsed;
      this.storageQuota = Number(storageInfo.quota) || this.storageQuota;
      this.retentionDays = Number(storageInfo.retentionDays) || this.retentionDays;
    }
  }

  private normalizeStorage(storage: unknown): StorageDataset[] {
    if (!storage || typeof storage !== 'object') return [];

    return Object.entries(storage as Record<string, unknown>)
      .filter(([, value]) => Array.isArray(value) && value.length > 0)
      .map(([key, value]) => {
        const meta = DATASET_META[key.toLocaleLowerCase()] || {
          label: key,
          unit: '',
          icon: 'fa-chart-line',
          color: '#6366f1',
        };
        const normalizedPoints = (value as unknown[])
          .map((item, index) => this.normalizePoint(item, index))
          .filter((item): item is StoragePoint => Boolean(item));
        return { key, ...meta, points: normalizedPoints };
      })
      .filter((dataset) => dataset.points.length > 0);
  }

  private normalizePoint(item: unknown, index: number): StoragePoint | undefined {
    if (typeof item === 'number') {
      return { time: new Date(Date.now() - index * 60_000), value: item };
    }
    if (!item || typeof item !== 'object') return undefined;

    const entry = item as Record<string, unknown>;
    const value = Number(entry['value'] ?? entry['data']);
    if (!Number.isFinite(value)) return undefined;
    const rawTime = entry['time'] ?? entry['date'] ?? entry['timestamp'];
    const time = rawTime ? new Date(rawTime as string | number) : new Date();
    return { time: Number.isNaN(time.getTime()) ? new Date() : time, value };
  }
}
