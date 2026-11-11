import type { DeviceUiSnapshot } from './device-ui.port';
import { generateDefaultPageLayout, parsePageLayout, reflowPageWidgets, type PageLayout } from './page-layout';
import type { UiTheme } from './ui-theme';

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
    widgets: reflowPageWidgets(widgets.map((widget, index) => ({
      ...widget,
      // Default names stay dynamic so later capability aliases can take effect.
      appearance: style && index === 0 ? 'emphasized' : 'default',
      grid: { ...widget.grid, x: 0, y: index },
    }))),
  }, snapshot.endpoints);
}
