import { Component, Input, ViewChild, ElementRef, ChangeDetectorRef, Renderer2 } from '@angular/core';
import { Layouter2Widget } from '../config';
import { ModalController, Events } from '@ionic/angular';
import { DebugComponent } from 'src/app/debug/debug.component';
import { DebugService } from 'src/app/debug/debug.service';

@Component({
  selector: 'widget-debug',
  templateUrl: 'widget-debug.html',
  styleUrls: ['widget-debug.scss']
})
export class WidgetDebugComponent implements Layouter2Widget {

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
    public debugService: DebugService,
    private modalCtrl: ModalController,
    private events: Events
  ) { }

  ngAfterViewInit(): void {
    this.events.subscribe('debugWidget', () => {
      setTimeout(() => {
        this.scrollToBottom();
      }, 50);
    });
  }

  ngOnDestroy(): void {
    this.events.unsubscribe('debugWidget');
  }

  scrollToBottom() {
    this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
  }

  sync() {
    this.events.publish('layouter2','send',`{"get":"state"}`);
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
