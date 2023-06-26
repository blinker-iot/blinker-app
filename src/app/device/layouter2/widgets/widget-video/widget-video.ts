import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import Hls from 'hls.js';

@Component({
  selector: 'widget-video',
  templateUrl: 'widget-video.html',
  styleUrls: ['widget-video.scss']
})
export class WidgetVideoComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;
  @Input() key;
  @Input() isDemo = false;

  videoPlayer: HTMLVideoElement;
  @ViewChild('video', { read: ElementRef }) video: ElementRef;
  playerState = "load"; //play,pause
  showVideo = false;

  hls;

  get url() {
    return this.getValue('url')
  }

  get playMode() {
    return this.getValue('mode')
  }

  get streamType() {
    return this.getValue('str')
  }

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return ''
  }

  _lstyle
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined')
      return this._lstyle
    if (typeof this.widget.lstyle != 'undefined')
      return this.widget.lstyle
    return 0;
  }

  constructor() { }

  ngAfterViewInit() {
    if (this.isDemo) return;
    if (this.streamType == 'hls')
      this.initHls();
  }

  ngOnDestroy(): void {
    //Called once, before the instance is destroyed.
    //Add 'implements OnDestroy' to the class.
    if (typeof this.hls != 'undefined') {
      this.hls.destroy()
    }
  }

  initHls() {
    if (this.url == '') return
    this.videoPlayer = this.video.nativeElement;
    // console.log(this.video);
    // if (Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(this.url);
      this.hls.attachMedia(this.videoPlayer);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.showVideo = true;
        this.playerState = 'pause';
        // console.log(this.playMode);
        if (this.playMode === 0) this.play()
      });
    // }
  }

  switch() {
    if (this.url == '') return
    if (this.playerState == 'pause') {
      this.play();
    } else {
      this.pause()
    }
  }

  play() {
    this.videoPlayer.play();
    this.playerState = 'play';
  }

  pause() {
    this.videoPlayer.pause();
    this.playerState = 'pause';
  }

  refresh() {
    if (this.streamType == 'hls')
      this.initHls();
  }

}
