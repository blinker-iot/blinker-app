export const TEXT_WIDGET_DEFAULT_FONT_SIZE = 14;
export const TEXT_WIDGET_MIN_FONT_SIZE = 10;
export const TEXT_WIDGET_MAX_FONT_SIZE = 24;
export const TEXT_WIDGET_DEFAULT_ALIGNMENT = 'left';

export type TextWidgetAlignment = 'left' | 'center' | 'right';

export const TEXT_WIDGET_STYLES = [
  { cols: 2, rows: 1 },
  { cols: 4, rows: 1 },
  { cols: 6, rows: 1 },
  { cols: 8, rows: 1 },
] as const;

type TextWidgetLike = {
  type?: unknown;
  t0?: unknown;
  tex?: unknown;
  size?: unknown;
  align?: unknown;
  lstyle?: unknown;
  cols?: unknown;
  rows?: unknown;
  [key: string]: unknown;
};

export function normalizeTextWidgetFontSize(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').trim());

  if (!Number.isFinite(parsed)) return TEXT_WIDGET_DEFAULT_FONT_SIZE;

  return Math.min(
    TEXT_WIDGET_MAX_FONT_SIZE,
    Math.max(TEXT_WIDGET_MIN_FONT_SIZE, Math.round(parsed))
  );
}

export function normalizeTextWidgetAlignment(
  value: unknown
): TextWidgetAlignment {
  if (value === 'center' || value === 'right') return value;
  return TEXT_WIDGET_DEFAULT_ALIGNMENT;
}

export function resolveTextWidgetStyle(widget: TextWidgetLike): number {
  const cols = Number(widget.cols);
  if (Number.isFinite(cols)) {
    if (cols <= 2) return 0;
    if (cols <= 4) return 1;
    if (cols <= 6) return 2;
    return 3;
  }

  // Legacy text styles used indices 0-6, including two-row variants.
  // Fall back to their original widths when an old item has no cols value.
  const legacyStyle = Number(widget.lstyle);
  if (legacyStyle === 1 || legacyStyle === 3) return 1;
  if (legacyStyle === 5 || legacyStyle === 6) return 3;
  return 0;
}

export function normalizeTextWidget<T>(widget: T): T {
  if (!widget || typeof widget !== 'object') return widget;

  const candidate = widget as TextWidgetLike;
  if (candidate.type !== 'tex') return widget;

  const lstyle = resolveTextWidgetStyle(candidate);
  const style = TEXT_WIDGET_STYLES[lstyle];
  const t0 =
    typeof candidate.t0 !== 'undefined' ? candidate.t0 : candidate.tex;

  return {
    ...candidate,
    ...(typeof t0 === 'undefined' ? {} : { t0 }),
    size: normalizeTextWidgetFontSize(candidate.size),
    align: normalizeTextWidgetAlignment(candidate.align),
    lstyle,
    cols: style.cols,
    rows: style.rows,
  } as T;
}
