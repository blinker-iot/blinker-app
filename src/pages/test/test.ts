import {
  Component,
  // ViewChild,
  // ViewContainerRef,
  // ElementRef,
  // Renderer2,
  // ComponentFactoryResolver,
  // ComponentFactory
} from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
// import { Gesture } from 'ionic-angular';
// declare var Hammer: any;


@IonicPage()
@Component({
  selector: 'page-test',
  templateUrl: 'test.html',
})
export class TestPage {

  gaugeType = "semi";
  gaugeValue = 28.3;
  gaugeLabel = "Speed";
  gaugeAppendText = "km/hr";
  thick=20;

  // gesture;
  // @ViewChild("contentZone", { read: ElementRef }) contentZone: ElementRef;

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  // ionViewDidLoad() {
  //   console.log('ionViewDidLoad TestPage');
  //   this.dragDown();
  // }

  // dragDown() {
  //   this.gesture = new Gesture(this.contentZone.nativeElement, {
  //     recognizers: [
  //       // [Hammer.Pan, { threshold: 1, direction: Hammer.DIRECTION_ALL }]
  //       [Hammer.Pan, { threshold: 50, direction: Hammer.DIRECTION_DOWN }]
  //     ]
  //   });
  //   this.listen();
  // }

  // listen() {
  //   this.gesture.listen();
  //   this.gesture.on('panstart', e => this.panstartEvent(e));
  //   this.gesture.on('panmove', e => this.panmoveEvent(e));
  //   this.gesture.on('panend', e => this.panendEvent(e));
  // }

  // refreshBegin = false;
  // panstartEvent(e) {
  //   console.log('panstartEvent');
  //   // let dim = this.content.getContentDimensions();
  //   // if (dim.scrollTop == 0) {
  //   //   console.log('panstartEvent');
  //   //   this.refreshBegin = true;
  //   // }
  // }
  // oldY = 0;
  // panmoveEvent(e) {
  //   // if (this.refreshBegin) {
  //   console.log('panmoveEvent');
  //   // console.log(e);
  //   // let y = this.oldY + e.deltaY;
  //   // console.log(y);
  //   // this.renderer.setStyle(this.spinner.nativeElement, 'top', `${y.toString()}px`);
  //   // }
  // }

  // panendEvent(e) {
  //   console.log('panendEvent');
  //   // this.refreshBegin = false;
  //   // this.renderer.setStyle(this.spinner.nativeElement, 'top', `0px`);
  //   // this.oldY = 0;
  // }

}
