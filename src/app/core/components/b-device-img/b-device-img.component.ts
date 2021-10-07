import { Component, Input, SimpleChanges } from '@angular/core';
import { ImageService } from '../../services/image.service';
import { ImageList } from 'src/app/configs/app.config';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'b-device-img',
  templateUrl: './b-device-img.component.html',
  styleUrls: ['./b-device-img.component.scss'],
})
export class BDeviceImgComponent {

  @Input() filename;
  @Input() deviceId;

  unknownUrl = `assets/img/devices/icon/unknown.png`

  url;

  constructor(
    private imageService: ImageService,
    private dataService: DataService
  ) { }

  ngOnChanges(changes: SimpleChanges) {
    this.imageService.loader.subscribe(loaded => {
      if (loaded) this.process()
    })
  }

  process() {
    let filename = '';
    if (typeof this.deviceId != 'undefined') {
      if (typeof this.dataService.device.dict[this.deviceId] != 'undefined')
        filename = this.dataService.device.dict[this.deviceId].config.image;
      else
        filename = 'unknown'
    } else if (typeof this.filename != 'undefined') {
      if ((this.filename.indexOf('https://') > -1 || this.filename.indexOf('http://') > -1) && (this.filename.indexOf('.png'))) {
        this.url = this.filename
        return
      }
      filename = this.filename;
    }
    this.processFilename(filename)
  }

  processFilename(filename) {
    if (filename.indexOf('.png') > -1)
      filename = filename.substring(0, filename.indexOf('.png'))
    if (ImageList.indexOf(filename) > -1) {
      this.url = `assets/img/devices/icon/${filename}.png`
    } else if (this.imageService.deviceIconList.indexOf(filename) > -1) {
      this.url = this.imageService.deviceIconDict[filename]
    } else {
      this.url = this.unknownUrl
    }
  }
}
