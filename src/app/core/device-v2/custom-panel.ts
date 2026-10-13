import type { UiTheme } from './ui-theme';

export type PanelMode = 'normal' | 'custom';

export interface CustomPanelDocument {
  version: 1;
  html: string;
  theme: UiTheme;
}

export const CUSTOM_PANEL_MAX_BYTES = 128 * 1024;

export function parseCustomPanel(value: unknown): CustomPanelDocument {
  const document = value as CustomPanelDocument;

  if (!document || document.version !== 1 || typeof document.html !== 'string'
    || !document.html.trim() || document.html.includes('\0')
    || new TextEncoder().encode(document.html).length > CUSTOM_PANEL_MAX_BYTES
    || !['natural', 'dark', 'electronic'].includes(document.theme)
    || Object.keys(document).some(key => !['version', 'html', 'theme'].includes(key))) {
    throw new Error('自定义界面必须包含 HTML，且不超过 128 KiB。');
  }

  return { version: 1, html: document.html, theme: document.theme };
}

