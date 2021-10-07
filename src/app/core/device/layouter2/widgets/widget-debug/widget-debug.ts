import { Component, Input, ViewChild, ElementRef, ChangeDetectorRef, Renderer2 } from '@angular/core';
import { Layouter2Widget } from '../config';
import { ModalController } from '@ionic/angular';
import { DebugComponent } from 'src/app/debug/debug.component';
import { DebugService } from 'src/app/debug/debug.service';
import { DeviceService } from 'src/app/core/services/device.service';

@Component({
  selector: 'widget-debug',
  templateUrl: 'widget-debug.html',
  styleUrls: ['widget-debug.scss']
})
export class WidgetDebugComponent implements Layouter2Widget {
  debugServiceSubject;
  @Input() device;
  @Input() widget;
  @Input() lstyle = 0;
  @Input() key;
  @Input() mode = 0;

  oldDataLength = 0;

  get data() {
    return this.debugService.dataList[this.device.deviceName]
  }

  @ViewChild("scrollContainer", { read: ElementRef, static: true }) scrollContainer: ElementRef;

  constructor(
    public changeDetectorRef: ChangeDetectorRef,
    public renderer: Renderer2,
    private debugService: DebugService,
    private modalCtrl: ModalController,
    private deviceService: DeviceService
  ) { }

  ngAfterViewInit() {
    this.debugServiceSubject = this.debugService.state.subscribe(() => {
      setTimeout(() => {
        this.scrollToBottom();
      }, 50);
    })
  }

  ngOnDestroy() {
    this.debugServiceSubject.unsubscribe();
  }

  scrollToBottom() {
    this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
  }

  sync() {
    this.deviceService.sendData(this.device, `{"get":"state"}`);
  }

  clear() {
    this.debugService.clean(this.device);
  }

  async showDebugModal() {
    console.log('showmodal');
    const modal = await this.modalCtrl.create({
      component: DebugComponent,
      componentProps: {
        'device': this.device,
        'mode': this.mode
      }
    });
    modal.present();
  }

}
