import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  ChangeDetectionStrategy,
  OnChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';

import { ImageService } from '../../services/image.service';
import { ImageList } from 'src/app/configs/app.config';
import { DataService } from '../../services/data.service';

@Component({
  standalone: true,
  imports: [],
  selector: 'b-device-img',
  templateUrl: './b-device-img.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./b-device-img.component.scss'],
})
export class BDeviceImgComponent implements OnChanges {
  @Input() filename;
  @Input() deviceId;

  unknownUrl = `img/devices/icon/unknown.png`;

  url;

  constructor(
    private imageService: ImageService,
    private dataService: DataService,
    private cd: ChangeDetectorRef,
    destroyRef: DestroyRef
  ) {
    this.imageService.loader
      .pipe(filter(Boolean), take(1), takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.process();
        this.cd.markForCheck();
      });
  }

  ngOnChanges() {
    // 内置图标无需等待远程图标列表，保证未登录预览也能立即显示。
    this.process();
  }

  process() {
    let filename = '';
    if (typeof this.deviceId != 'undefined') {
      if (typeof this.dataService.device.dict[this.deviceId] != 'undefined')
        filename = this.dataService.device.dict[this.deviceId].config.image;
      else filename = 'unknown';
    } else if (typeof this.filename != 'undefined') {
      if (
        (this.filename.indexOf('https://') > -1 ||
          this.filename.indexOf('http://') > -1) &&
        this.filename.indexOf('.png')
      ) {
        this.url = this.filename;
        return;
      }
      filename = this.filename;
    }
    this.processFilename(filename);
  }

  processFilename(filename) {
    if (filename.indexOf('.png') > -1)
      filename = filename.substring(0, filename.indexOf('.png'));
    if (ImageList.indexOf(filename) > -1) {
      this.url = `img/devices/icon/${filename}.png`;
    } else if (this.imageService.deviceIconList.has(filename)) {
      this.url = this.imageService.deviceIconDict[filename];
    } else {
      this.url = this.unknownUrl;
    }
  }
}
