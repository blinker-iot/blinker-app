import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';

import { BDeviceImgComponent } from '../../components/b-device-img/b-device-img.component';
import {
  DeviceImageAsset,
  DeviceImageVariant,
  ImageService,
} from '../../services/image.service';
import { ViewService } from '../../services/view.service';

interface DeviceImageCategory {
  id: string;
  label: string;
}

const DEVICE_IMAGE_CATEGORIES: DeviceImageCategory[] = [
  { id: 'all', label: '全部' },
  { id: 'home-living', label: '家居生活' },
  { id: 'development-boards', label: '开发板' },
  { id: 'health-wearables', label: '健康穿戴' },
  { id: 'agriculture-forestry', label: '农林环境' },
  { id: 'municipal-buildings', label: '市政楼宇' },
  { id: 'retail-logistics', label: '零售物流' },
];

@Component({
  standalone: true,
  selector: 'page-device-icon',
  templateUrl: 'device-icon.html',
  styleUrls: ['device-icon.scss'],
  imports: [CommonModule, FormsModule, IonicModule, BDeviceImgComponent],
})
export class DeviceIconPage implements OnInit {
  @Input() currentImage?: string;

  readonly categories = DEVICE_IMAGE_CATEGORIES;
  searchText = '';
  selectedCategory = 'all';
  previewVariant: DeviceImageVariant;

  get images(): readonly DeviceImageAsset[] {
    const query = this.searchText.trim().toLocaleLowerCase();
    return this.imageService.deviceImages.filter((image) => {
      const inCategory =
        this.selectedCategory === 'all' ||
        this.getCategory(image) === this.selectedCategory;
      if (!inCategory) return false;
      if (!query) return true;

      return [image.name, ...image.keywords]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
    });
  }

  get isLoading(): boolean {
    return !this.imageService.loader.value;
  }

  get loadError(): boolean {
    return this.imageService.loadError;
  }

  constructor(
    private readonly modalCtrl: ModalController,
    public readonly imageService: ImageService,
    viewService: ViewService,
  ) {
    this.previewVariant = viewService.theme;
  }

  ngOnInit(): void {
    this.imageService.init();
  }

  getCategory(image: DeviceImageAsset): string {
    return image.light.split('/')[0] || 'all';
  }

  categoryCount(category: string): number {
    if (category === 'all') return this.imageService.deviceImages.length;
    return this.imageService.deviceImages.filter(
      (image) => this.getCategory(image) === category,
    ).length;
  }

  isSelected(image: DeviceImageAsset): boolean {
    return this.imageService.findDeviceImage(this.currentImage)?.light === image.light;
  }

  select(image: DeviceImageAsset): void {
    void this.modalCtrl.dismiss(image.light);
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }
}
