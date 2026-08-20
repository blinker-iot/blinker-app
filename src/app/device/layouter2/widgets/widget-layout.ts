import { normalizeTextWidget } from './widget-text/widget-text-layout';

type WidgetLayout = {
  type?: unknown;
  [key: string]: unknown;
};

export function normalizeWidgetLayout<T>(widget: T): T {
  const normalizedWidget = normalizeTextWidget(widget);
  if (!normalizedWidget || typeof normalizedWidget !== 'object') {
    return normalizedWidget;
  }

  const candidate = normalizedWidget as WidgetLayout;
  if (candidate.type !== 'deb' && candidate.type !== 'cha') {
    return normalizedWidget;
  }

  return {
    ...candidate,
    lstyle: 0,
    cols: 8,
    rows: 4,
  } as T;
}
