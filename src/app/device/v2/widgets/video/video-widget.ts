import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, signal } from '@angular/core';
import type Hls from 'hls.js';

import { UiIconComponent } from '../icon/ui-icon';

// The existing video widget's wire/configuration fields.
export interface VideoWidgetSource {
  url: string;
  str: 'mjpg' | 'hls';
  mode: 0 | 1;
}

interface VideoSession extends VideoWidgetSource {
  revision: number;
}

type VideoState = 'empty' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

@Component({
  selector: 'app-video-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './video-widget.html',
  styleUrls: ['./video-widget.scss'],
})
export class VideoWidgetComponent implements OnChanges, OnDestroy {
  @Input() title = '视频';
  @Input({ required: true }) source!: VideoWidgetSource;
  @Output() readonly configure = new EventEmitter<void>();

  readonly state = signal<VideoState>('empty');
  readonly sessions = signal<readonly VideoSession[]>([]);

  private hls?: Hls;
  private video?: HTMLVideoElement;
  private revision = 0;
  private suspended = false;

  @ViewChild('video')
  set videoElement(element: ElementRef<HTMLVideoElement> | undefined) {
    this.video = element?.nativeElement;
    const session = this.sessions()[0];

    if (this.video && session) void this.loadHls(this.video, session);
  }

  get status(): string {
    return { empty: '未连接', loading: '连接中', ready: '待播放', playing: '播放中', paused: '已暂停', error: '连接失败' }[this.state()];
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['source'];
    if (!change) return;

    const previous = change.previousValue as VideoWidgetSource | undefined;
    if (previous?.url !== this.source.url || previous?.str !== this.source.str || previous?.mode !== this.source.mode) this.reload();
  }

  reload(): void {
    this.stop();
    this.state.set('empty');

    const raw = this.source.url.trim();
    if (this.suspended || !raw) return;

    let url: URL;
    try {
      url = new URL(raw, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported media URL');
    } catch {
      this.state.set('error');
      return;
    }

    this.state.set('loading');
    this.sessions.set([{ ...this.source, url: url.href, revision: this.revision }]);
  }

  ready(revision: number): void {
    if (revision !== this.revision || this.state() !== 'loading') return;

    this.state.set('ready');
    if (this.source.mode !== 0) return;

    void this.video?.play().catch(() => {
      if (revision === this.revision && this.state() === 'ready') this.state.set('paused');
    });
  }

  playing(revision: number): void {
    if (revision === this.revision) this.state.set('playing');
  }

  paused(revision: number): void {
    if (revision === this.revision && this.state() === 'playing') this.state.set('paused');
  }

  fail(revision: number): void {
    if (revision !== this.revision) return;

    this.stop();
    this.state.set('error');
  }

  suspend(): void {
    this.suspended = true;
    this.stop();
    this.state.set('empty');
  }

  resume(): void {
    if (!this.suspended) return;

    this.suspended = false;
    this.reload();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async loadHls(video: HTMLVideoElement, session: VideoSession): Promise<void> {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = session.url;
      video.load();
      return;
    }

    try {
      const { default: Hls } = await import('hls.js');
      if (session.revision !== this.revision) return;

      if (!Hls.isSupported()) {
        this.fail(session.revision);
        return;
      }

      const hls = new Hls();
      this.hls = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => this.ready(session.revision));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) this.fail(session.revision);
      });

      hls.loadSource(session.url);
      hls.attachMedia(video);
    } catch {
      this.fail(session.revision);
    }
  }

  private stop(): void {
    this.revision++;
    this.sessions.set([]);

    const hls = this.hls;
    this.hls = undefined;
    hls?.destroy();

    this.video?.pause();
    this.video?.removeAttribute('src');
    this.video?.load();
  }
}
