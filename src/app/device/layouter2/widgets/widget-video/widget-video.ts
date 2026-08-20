import {
  AfterViewInit,
  Component,
  DoCheck,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgClass } from '@angular/common';
import Hls from 'hls.js';
import { Layouter2Widget } from '../config';

@Component({
  selector: 'widget-video',
  templateUrl: 'widget-video.html',
  styleUrls: ['widget-video.scss'],
  imports: [NgClass],
})
export class WidgetVideoComponent
  implements Layouter2Widget, OnInit, DoCheck, AfterViewInit, OnDestroy
{
  private static readonly RETRY_DELAY_MS = 1000;

  @Input() device;
  @Input() widget;
  @Input() key;
  @Input() isDemo = false;

  @ViewChild('video', { read: ElementRef })
  video?: ElementRef<HTMLVideoElement>;

  videoPlayer?: HTMLVideoElement;
  playerState: 'load' | 'play' | 'pause' = 'load';
  showVideo = false;
  hasError = false;
  renderImage = true;

  hls?: Hls;

  private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private viewInitialized = false;
  private destroyed = false;
  private observedUrl = '';
  private observedStreamType = '';

  get url() {
    return this.getValue('url');
  }

  get mediaUrl(): string {
    const value = this.url;
    return value == null ? '' : String(value).trim();
  }

  get showNoData(): boolean {
    return this.hasError || !this.mediaUrl;
  }

  get playMode() {
    return this.getValue('mode');
  }

  get streamType() {
    return this.getValue('str');
  }

  getValue(valueKey) {
    if (this.isDemo && typeof this.widget?.[valueKey] != 'undefined') {
      return this.widget[valueKey];
    }

    const widgetKey =
      typeof this.key != 'undefined' ? this.key : this.widget?.key;
    if (typeof this.device?.data?.[widgetKey] != 'undefined') {
      if (typeof this.device.data[widgetKey][valueKey] != 'undefined') {
        return this.device.data[widgetKey][valueKey];
      }
    }
    if (typeof this.widget?.[valueKey] != 'undefined') {
      return this.widget[valueKey];
    }
    return '';
  }

  _lstyle;
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle;
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined') return this._lstyle;
    if (typeof this.widget.lstyle != 'undefined') return this.widget.lstyle;
    return 0;
  }

  ngOnInit(): void {
    this.rememberCurrentSource();
    if (this.mediaUrl) return;

    this.hasError = true;
    this.renderImage = false;
    this.scheduleRetry();
  }

  ngDoCheck(): void {
    const source = this.mediaUrl;
    const streamType = this.streamType;
    if (
      source === this.observedUrl &&
      streamType === this.observedStreamType
    ) {
      return;
    }

    this.observedUrl = source;
    this.observedStreamType = streamType;
    if (!this.viewInitialized) return;

    // A failed source stays on the same one-second retry cadence even if its
    // URL is updated while the timer is pending.
    if (source && this.hasError && this.retryTimer !== null) return;
    this.loadChangedSource(source, streamType);
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;

    if (this.streamType === 'hls' && !this.isDemo) {
      this.initHls();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearRetry();
    this.destroyHls();
  }

  initHls(): void {
    this.clearRetry();
    this.destroyHls();
    this.showVideo = false;
    this.playerState = 'load';

    const source = this.mediaUrl;
    if (!source || !this.viewInitialized || !this.video?.nativeElement) {
      this.handleHlsFailure();
      return;
    }

    this.videoPlayer = this.video.nativeElement;

    let hls: Hls;
    try {
      hls = new Hls();
      this.hls = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (
          this.destroyed ||
          this.hls !== hls ||
          this.streamType !== 'hls' ||
          this.mediaUrl !== source
        ) {
          return;
        }

        this.clearRetry();
        this.hasError = false;
        this.showVideo = true;
        this.playerState = 'pause';
        if (this.playMode === 0) this.play();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (
          !data.fatal ||
          this.hls !== hls ||
          this.streamType !== 'hls' ||
          this.mediaUrl !== source
        ) {
          return;
        }
        this.handleHlsFailure();
      });

      hls.loadSource(source);
      hls.attachMedia(this.videoPlayer);
    } catch {
      if (this.hls === hls) this.hls = undefined;
      hls?.destroy();
      this.handleHlsFailure();
    }
  }

  onImageLoad(): void {
    if (this.streamType !== 'mjpg') return;

    if (!this.mediaUrl) {
      this.handleImageFailure();
      return;
    }

    this.clearRetry();
    this.hasError = false;
    this.renderImage = true;
  }

  onImageError(): void {
    if (this.streamType !== 'mjpg') return;
    this.handleImageFailure();
  }

  switch(): void {
    if (!this.mediaUrl || this.hasError || !this.showVideo) return;

    if (this.playerState === 'pause') {
      this.play();
    } else {
      this.pause();
    }
  }

  play(): void {
    if (!this.videoPlayer) return;
    try {
      const playRequest = this.videoPlayer.play();
      this.playerState = 'play';
      void Promise.resolve(playRequest).catch(() => {
        if (!this.destroyed) this.playerState = 'pause';
      });
    } catch {
      this.playerState = 'pause';
    }
  }

  pause(): void {
    if (!this.videoPlayer) return;
    this.videoPlayer.pause();
    this.playerState = 'pause';
  }

  refresh(): void {
    this.rememberCurrentSource();
    this.clearRetry();

    if (this.streamType === 'hls') {
      if (this.isDemo) {
        if (this.mediaUrl) {
          this.hasError = false;
        } else {
          this.handleHlsFailure();
        }
        return;
      }
      this.initHls();
      return;
    }

    if (this.streamType === 'mjpg') {
      this.destroyHls();
      this.videoPlayer = undefined;
      this.showVideo = false;
      this.playerState = 'load';
      if (!this.mediaUrl) {
        this.handleImageFailure();
      } else {
        this.hasError = false;
        this.renderImage = true;
      }
    }
  }

  private handleImageFailure(): void {
    this.hasError = true;
    this.renderImage = false;
    this.scheduleRetry();
  }

  private handleHlsFailure(): void {
    this.hasError = true;
    this.showVideo = false;
    this.playerState = 'load';
    this.destroyHls();
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.destroyed || this.retryTimer !== null) return;

    this.retryTimer = globalThis.setTimeout(() => {
      this.retryTimer = null;
      this.retry();
    }, WidgetVideoComponent.RETRY_DELAY_MS);
  }

  private retry(): void {
    if (this.destroyed) return;

    const source = this.mediaUrl;
    const streamType = this.streamType;
    this.observedUrl = source;
    this.observedStreamType = streamType;

    if (!source) {
      this.hasError = true;
      this.renderImage = false;
      this.scheduleRetry();
      return;
    }

    if (streamType === 'mjpg') {
      this.renderImage = true;
      return;
    }

    if (streamType === 'hls') {
      if (this.isDemo) {
        this.hasError = false;
        return;
      }
      this.initHls();
    }
  }

  private loadChangedSource(source: string, streamType: string): void {
    if (!source) {
      if (streamType === 'hls') {
        this.handleHlsFailure();
      } else {
        this.destroyHls();
        this.videoPlayer = undefined;
        this.showVideo = false;
        this.playerState = 'load';
        this.handleImageFailure();
      }
      return;
    }

    this.clearRetry();
    if (streamType === 'hls') {
      this.renderImage = false;
      if (this.isDemo) {
        this.destroyHls();
        this.hasError = false;
        this.showVideo = false;
      } else {
        this.initHls();
      }
      return;
    }

    if (streamType === 'mjpg') {
      this.destroyHls();
      this.videoPlayer = undefined;
      this.showVideo = false;
      this.playerState = 'load';
      this.hasError = false;
      this.renderImage = true;
    }
  }

  private rememberCurrentSource(): void {
    this.observedUrl = this.mediaUrl;
    this.observedStreamType = this.streamType;
  }

  private clearRetry(): void {
    if (this.retryTimer === null) return;
    globalThis.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private destroyHls(): void {
    const hls = this.hls;
    this.hls = undefined;
    hls?.destroy();
  }
}
