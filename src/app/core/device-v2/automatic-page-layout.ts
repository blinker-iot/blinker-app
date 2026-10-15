import type { DeviceUiSnapshot } from './device-ui.port';
import { generateDefaultPageLayout, parsePageLayout, reflowPageWidgets, type PageLayout } from './page-layout';
import { fitSize, widgetVariant } from './page-widget';
import type { UiTheme } from './ui-theme';
import { presetForVariant } from './widget-presets';

const labels: Record<string, string> = {
  switch: '电源开关', temperature: '温度', humidity: '湿度', brightness: '亮度',
  soilMoisture: '土壤湿度', co2: '二氧化碳', power: '功率', voltage: '电压',
};

export function generateAutomaticPageLayout(
  snapshot: DeviceUiSnapshot,
  style?: UiTheme,
  hiddenKeys: readonly string[] = [],
): PageLayout {
  const base = generateDefaultPageLayout(snapshot);
  const widgets = base.widgets.filter(widget => !hiddenKeys.includes(widget.endpointKey));

  if (style) {
    const rank = (type: string) => style === 'electronic' ? (type === 'value' ? 0 : 1)
      : type === 'switch' || type === 'button' ? 0 : type === 'value' ? 1 : 2;

    widgets.sort((left, right) => rank(left.type) - rank(right.type));
  }

  return parsePageLayout({
    ...base,
    ...(style ? { style } : {}),
    widgets: reflowPageWidgets(widgets.map((widget, index) => {
      const preset = presetForVariant(widgetVariant(widget.type, widget.variant));

      return {
        ...widget,
        title: labels[widget.endpointKey] || widget.endpointKey,
        appearance: style && index === 0 ? 'emphasized' : 'default',
        options: { ...preset.options },
        grid: { x: 0, y: index, ...fitSize(preset.variant, preset.width, preset.height) },
      };
    })),
  }, snapshot.endpoints);
}
