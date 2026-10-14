import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaPreviewKind, VideoPreviewSettings, WeatherPreviewSettings } from './component-preview.media';

@Component({
  selector: 'app-media-preview-inspector',
  standalone: true,
  templateUrl: './media-preview-inspector.html',
  styleUrls: ['./media-preview-inspector.scss'],
})

export class MediaPreviewInspectorComponent {
  @Input({ required: true }) kind!: MediaPreviewKind;
  @Input({ required: true }) video!: VideoPreviewSettings;
  @Input({ required: true }) weather!: WeatherPreviewSettings;
  @Output() readonly videoChange = new EventEmitter<VideoPreviewSettings>();
  @Output() readonly weatherChange = new EventEmitter<WeatherPreviewSettings>();

  readonly weatherOptions = [
    { key: 'showMetrics', label: '天气指标' },
    { key: 'showForecast', label: '逐小时预报' },
    { key: 'showAlerts', label: '天气预警' },
  ] as const;

  get title(): string { return this.kind === 'video' ? this.video.title : this.weather.title; }

  get json(): string {
    return JSON.stringify(this.kind === 'video'
      ? { type: 'vid', cols: 8, ...this.video }
      : { type: 'wea', cols: 8, ...this.weather }, null, 2);
  }

  setTitle(title: string): void {
    if (this.kind === 'video') this.setVideo({ title: title.trim() || '视频' });
    else this.weatherChange.emit({ ...this.weather, title: title.trim() || '天气' });
  }

  setVideo(patch: Partial<VideoPreviewSettings>): void {
    this.videoChange.emit({ ...this.video, ...patch });
  }

  setWeather(key: 'showMetrics' | 'showForecast' | 'showAlerts', value: boolean): void {
    this.weatherChange.emit({ ...this.weather, [key]: value });
  }
}
