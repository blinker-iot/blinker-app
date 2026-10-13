import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { WeatherMetric, WeatherSnapshot } from '../../../layouter2/widgets/widget-weather/weather-data.adapter';
import type { WeatherAlert, WeatherForecastHour } from '../../../layouter2/widgets/widget-weather/weather-outlook.adapter';
import { UiIconComponent } from '../icon/ui-icon';
import { ValueTransitionDirective } from '../value-transition.directive';

@Component({
  selector: 'app-weather-widget',
  standalone: true,
  imports: [DatePipe, UiIconComponent, ValueTransitionDirective],
  templateUrl: './weather-widget.html',
  styleUrls: ['./weather-widget.scss'],
})

export class WeatherWidgetComponent {
  @Input() title = '天气';
  @Input() snapshot: WeatherSnapshot | null = null;
  @Input() forecastHours: readonly WeatherForecastHour[] = [];
  @Input() alerts: readonly WeatherAlert[] = [];
  @Input() showMetrics = true;
  @Input() showForecast = true;
  @Input() showAlerts = true;

  tab: 'current' | 'forecast' = 'current';

  get activeTab(): 'current' | 'forecast' {
    if (!this.showMetrics) return 'forecast';

    return this.showForecast ? this.tab : 'current';
  }

  get metrics() { return this.snapshot?.metrics.map(metric => this.displayMetric(metric)) ?? []; }

  private displayMetric(metric: WeatherMetric): WeatherMetric & { original: string } {
    const display = { ...metric, original: `${metric.label}：${metric.value} ${metric.unit}`.trim() };
    const value = Number(metric.value);

    if (!metric.value.trim() || !Number.isFinite(value)) return display;

    // Convert quantities instead of abbreviating a unit into another meaning.
    if (metric.unit === 'km/h') {
      display.value = String(Number((value / 1.852).toFixed(1)));
      display.unit = '节';
    } else if (metric.unit === 'hPa') {
      display.value = String(Number((value / 1000).toFixed(2)));
      display.unit = '巴';
    }

    return display;
  }
}
