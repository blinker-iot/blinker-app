import type { WeatherSnapshot } from '../../../device/layouter2/widgets/widget-weather/weather-data.adapter';
import type { WeatherAlert, WeatherForecastHour } from '../../../device/layouter2/widgets/widget-weather/weather-outlook.adapter';
import type { VideoWidgetSource } from '../../../device/v2/widgets/video/video-widget';

export type MediaPreviewKind = 'video' | 'weather';

export interface VideoPreviewSettings extends VideoWidgetSource {
  title: string;
}

export interface WeatherPreviewSettings {
  title: string;
  showMetrics: boolean;
  showForecast: boolean;
  showAlerts: boolean;
}

// Keep the previous weather demo's values and normalized data contract.
// This fixture never requests location, credentials or a weather provider.
export function createWeatherPreview(now = Date.now()): {
  snapshot: WeatherSnapshot;
  forecastHours: WeatherForecastHour[];
  alerts: WeatherAlert[];
} {
  return {
    snapshot: {
      provider: 'seniverse', location: '杭州市', region: '浙江',
      temperature: '26', condition: '多云', icon: 'fa-light fa-cloud-sun',
      isDay: true, observedAt: new Date(now),
      metrics: [
        { id: 'feels-like', label: '体感', value: '27', unit: '°C', icon: 'fa-light fa-temperature-half' },
        { id: 'humidity', label: '湿度', value: '68', unit: '%', icon: 'fa-light fa-droplet' },
        { id: 'wind', label: '东南风', value: '12.6', unit: 'km/h', icon: 'fa-light fa-wind' },
        { id: 'pressure', label: '气压', value: '1012', unit: 'hPa', icon: 'fa-light fa-gauge-high' },
        { id: 'visibility', label: '能见度', value: '10', unit: 'km', icon: 'fa-light fa-eye' },
        { id: 'precipitation', label: '降水', value: '0.2', unit: 'mm', icon: 'fa-light fa-cloud-rain' },
        { id: 'cloud', label: '云量', value: '72', unit: '%', icon: 'fa-light fa-clouds' },
        { id: 'uv', label: '紫外线', value: '3', unit: '', icon: 'fa-light fa-sun' },
      ],
    },
    forecastHours: [
      {
        id: 'demo-hour-1', time: new Date(now + 60 * 60 * 1000),
        temperature: 27, feelsLike: 28, condition: '多云',
        precipitationProbability: 20, precipitation: 0, humidity: 68,
        windSpeed: 10, windDirection: '东南风', icon: 'fa-light fa-cloud-sun',
      },
      {
        id: 'demo-hour-2', time: new Date(now + 2 * 60 * 60 * 1000),
        temperature: 26, feelsLike: 27, condition: '阵雨',
        precipitationProbability: 65, precipitation: 1.2, humidity: 74,
        windSpeed: 12, windDirection: '东风', icon: 'fa-light fa-cloud-rain',
      },
      {
        id: 'demo-hour-3', time: new Date(now + 3 * 60 * 60 * 1000),
        temperature: 25, feelsLike: 26, condition: '小雨',
        precipitationProbability: 55, precipitation: 0.6, humidity: 76,
        windSpeed: 9, windDirection: '东北风', icon: 'fa-light fa-cloud-showers-heavy',
      },
    ],
    alerts: [{
      id: 'demo-alert', title: '雷电黄色预警', type: '雷电', level: '黄色',
      severity: 'yellow', status: '预警中',
      description: '预计未来六小时部分地区可能发生雷电活动，并伴有短时强降水。',
      publishedAt: new Date(now), effectiveAt: null, expiresAt: null,
      source: '杭州市气象台', areas: ['杭州市'],
      instruction: '减少户外活动，远离高处、孤立树木和金属设施。',
    }],
  };
}
