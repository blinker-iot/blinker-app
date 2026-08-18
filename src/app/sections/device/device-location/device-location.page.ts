import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { HeroCardComponent } from 'src/app/core/components/hero-card/hero-card.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';

interface LocationPreset {
  name: string;
  description: string;
  longitude: number;
  latitude: number;
}

const TEST_LOCATION: LocationPreset = {
  name: '杭州测试点',
  description: '默认调试坐标',
  longitude: 120.1551,
  latitude: 30.2741,
};

@Component({
  selector: 'app-device-location',
  templateUrl: './device-location.page.html',
  styleUrls: ['./device-location.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, HeroCardComponent],
})
export class DeviceLocationPage implements OnInit, OnDestroy {
  readonly presets: readonly LocationPreset[] = [
    TEST_LOCATION,
    {
      name: '上海测试点',
      description: '华东设备样例',
      longitude: 121.4737,
      latitude: 31.2304,
    },
    {
      name: '成都测试点',
      description: '西南设备样例',
      longitude: 104.0665,
      latitude: 30.5723,
    },
  ];

  id = '';
  device?: BlinkerDevice;
  loaded = false;
  locating = false;
  saving = false;
  usingTestData = false;
  longitude = TEST_LOCATION.longitude;
  latitude = TEST_LOCATION.latitude;
  savedLongitude = TEST_LOCATION.longitude;
  savedLatitude = TEST_LOCATION.latitude;

  private subscription?: Subscription;

  get defaultBackHref(): string {
    return `/device-manager/${this.id}`;
  }

  get deviceName(): string {
    return this.device?.config?.customName || '设备';
  }

  get coordinatesValid(): boolean {
    return (
      Number.isFinite(this.longitude) &&
      Number.isFinite(this.latitude) &&
      this.longitude >= -180 &&
      this.longitude <= 180 &&
      this.latitude >= -90 &&
      this.latitude <= 90
    );
  }

  get hasChanges(): boolean {
    return (
      this.coordinatesValid &&
      (this.longitude !== this.savedLongitude || this.latitude !== this.savedLatitude)
    );
  }

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dataService: DataService,
    private readonly deviceService: DeviceService,
    private readonly noticeService: NoticeService,
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

  selectPreset(preset: LocationPreset): void {
    this.longitude = preset.longitude;
    this.latitude = preset.latitude;
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      void this.noticeService.showToast('当前设备不支持定位');
      return;
    }

    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.longitude = Number(position.coords.longitude.toFixed(6));
        this.latitude = Number(position.coords.latitude.toFixed(6));
        this.locating = false;
      },
      () => {
        this.locating = false;
        void this.noticeService.showToast('无法获取当前位置，请检查定位权限');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async saveGeolocation(): Promise<void> {
    if (!this.device || !this.coordinatesValid || this.saving) return;

    this.saving = true;
    const position = {
      location: [this.longitude, this.latitude],
      address: '',
    };

    try {
      const saved = this.device.config.isPreview
        ? true
        : await this.deviceService.saveDeviceConfig(this.device, { position });

      if (!saved) {
        await this.noticeService.showToast('设备位置保存失败，请稍后重试');
        return;
      }

      this.device.config.position = position;
      this.savedLongitude = this.longitude;
      this.savedLatitude = this.latitude;
      this.usingTestData = false;
      await this.noticeService.showToast('设备位置已更新');
    } finally {
      this.saving = false;
    }
  }

  private bindDevice(): void {
    this.device = this.dataService.device?.dict?.[this.id];
    this.loaded = Boolean(this.device);
    if (!this.device) return;

    const location = this.device.config?.position?.location;
    const hasStoredLocation =
      Array.isArray(location) &&
      location.length >= 2 &&
      Number.isFinite(Number(location[0])) &&
      Number.isFinite(Number(location[1]));

    this.longitude = hasStoredLocation ? Number(location[0]) : TEST_LOCATION.longitude;
    this.latitude = hasStoredLocation ? Number(location[1]) : TEST_LOCATION.latitude;
    this.savedLongitude = this.longitude;
    this.savedLatitude = this.latitude;
    this.usingTestData = !hasStoredLocation;
  }
}
