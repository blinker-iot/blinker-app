import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  OnChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';

import { DataService } from '../../services/data.service';
import {
  DeviceImageVariant,
  ImageService,
} from '../../services/image.service';

@Component({
  standalone: true,
  imports: [],
  selector: 'b-device-img',
  templateUrl: './b-device-img.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./b-device-img.component.scss'],
})
export class BDeviceImgComponent implements OnChanges {
  @Input() filename?: string;
  @Input() deviceId?: string;
  @Input() variant: DeviceImageVariant | 'auto' = 'auto';
  @Input() alt = '';

  readonly unknownUrl =
    'devices/home-living/unknown-device-light.webp';
  url = this.unknownUrl;

  private resolvedVariant: DeviceImageVariant = 'light';

  constructor(
    private readonly imageService: ImageService,
    private readonly dataService: DataService,
    private readonly cd: ChangeDetectorRef,
    destroyRef: DestroyRef,
  ) {
    this.imageService.loader
      .pipe(filter(Boolean), take(1), takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.process();
        this.cd.markForCheck();
      });
  }

  ngOnChanges(): void {
    this.process();
  }

  useFallback(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    const fallback =
      this.resolvedVariant === 'dark'
        ? 'devices/home-living/unknown-device-dark.webp'
        : this.unknownUrl;
    if (!image.src.endsWith(fallback)) image.src = fallback;
  }

  private process(): void {
    const reference = this.getReference();
    const source = this.imageService.resolveDeviceImage(reference);
    this.resolvedVariant = this.resolveVariant(reference);
    this.url = source[this.resolvedVariant];
  }

  private resolveVariant(reference?: string): DeviceImageVariant {
    if (this.variant !== 'auto') return this.variant;

    return reference && /-dark\.webp(?:[?#]|$)/i.test(reference)
      ? 'dark'
      : 'light';
  }

  private getReference(): string | undefined {
    if (this.deviceId) {
      return this.dataService.device?.dict?.[this.deviceId]?.config?.image;
    }
    return this.filename;
  }
}
