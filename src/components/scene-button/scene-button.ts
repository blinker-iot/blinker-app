import {
  Component, Input
  // , ViewChild, ElementRef, Renderer2 
} from '@angular/core';
import { DeviceProvider } from '../../providers/device/device';
import { Events } from 'ionic-angular';
import { AutoProvider } from '../../providers/auto/auto';

@Component({
  selector: 'scene-button',
  templateUrl: 'scene-button.html'
})
export class SceneButtonComponent {

  @Input() scene: any;
  @Input() enable: boolean = true;
  waiting = false;
  done = false;
  progress;

  constructor(
    public deviceProvider: DeviceProvider,
    // public renderer: Renderer2,
    public events: Events,
    private autoProvider: AutoProvider
  ) {
  }

  sendData() {
    if (!this.enable) return;
    navigator.vibrate(10);
    this.waiting = true;
    this.progress = 0;
    let timer = window.setTimeout(() => {
      this.waiting = false;
      this.done = false;
    }, 5000);
    this.events.subscribe(JSON.stringify(this.scene.actions), data => {
      // console.log('done1');
      this.progress = this.progress + 1 / this.scene.actions.length;
      if (this.progress === 1) {
        this.waiting = false;
        this.done = true;
        window.clearTimeout(timer);
        this.events.unsubscribe(JSON.stringify(this.scene.actions));
        window.setTimeout(() => {
          this.done = false;
        }, 500);
      }
    });
    this.autoProvider.process(this.scene);
  }


}

