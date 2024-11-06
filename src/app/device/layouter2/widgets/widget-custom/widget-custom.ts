import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Layouter2Widget } from '../config';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'widget-custom',
  templateUrl: 'widget-custom.html',
  styleUrls: ['widget-custom.scss']
})
export class WidgetCustomComponent implements Layouter2Widget {

  @Input() widget;
  @Input() device;

  get key() {
    return this.widget.key;
  }

  url;
  @ViewChild('iframeBox', { read: ElementRef, static: false }) iframeBox: ElementRef;
  deviceSubject;
  getValue(valueKeys: string[]): any {
    for (let valueKey of valueKeys) {
      if (typeof this.device.data[this.key] != 'undefined')
        if (typeof this.device.data[this.key][valueKey] != 'undefined')
          return this.device.data[this.key][valueKey]
      if (typeof this.widget[valueKey] != 'undefined')
        return this.widget[valueKey]
    };
    return
  }

  constructor(
    private sanitizer: DomSanitizer,
  ) { }

  ngOnInit() {
    this.initUrl()
    this.deviceSubject = this.device.subject.subscribe(() => {
      this.syncDeviceData()
    })
  }

  ngOnDestroy() {
    this.deviceSubject.unsubscribe()
  }

  initUrl() {
    if (this.widget.src != '' && this.widget.src != null) {
      this.url = this.sanitizer.bypassSecurityTrustResourceUrl(this.widget.src);
    }
  }

  send2iframe(data) {
    this.iframeBox.nativeElement.contentWindow.postMessage(data, '*')
  }

  syncDeviceData() {
    this.send2iframe({ deviceData: this.device.data, widgetData: this.widget })
  }

}
