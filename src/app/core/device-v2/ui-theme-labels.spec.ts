import { normalizeUiTheme, UI_THEME_IDS, UI_THEMES } from './ui-theme';

describe('QA5 neutral theme labels', () => {
  it('uses neutral appearance captions without competitor application names', () => {
    expect(UI_THEMES.map(theme => theme.caption)).toEqual(['浅色 · 圆润磁贴', 'OLED 点阵 · 数据优先', '深色 · 低光舒适']);
    expect(JSON.stringify(UI_THEMES)).not.toMatch(/米家|小米|mijia|blynk|ifttt|tuya|home\s*assistant/i);
  });

  it('retains saved theme IDs, names and legacy normalization', () => {
    expect(UI_THEME_IDS).toEqual(['natural', 'electronic', 'dark']);
    expect(UI_THEMES.map(theme => [theme.id, theme.name])).toEqual([['natural', '自然'], ['electronic', '电子'], ['dark', '暗夜']]);
    for (const id of UI_THEME_IDS) expect(normalizeUiTheme(id)).toBe(id);
    for (const id of ['minimal', 'warm', 'clear', 'sand']) expect(normalizeUiTheme(id)).toBe('natural');
    expect(normalizeUiTheme('technical')).toBe('electronic'); expect(normalizeUiTheme('graphite')).toBe('dark');
    expect(normalizeUiTheme('unknown-theme')).toBeUndefined();
  });
});
