import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyThemeToDocument,
  readStoredTheme,
  saveTheme,
} from './theme';

describe('app theme', () => {
  let themeStyles: HTMLStyleElement;
  beforeAll(() => {
    // Angular adds global styles to its browser test HTML, not JSDOM. Load the
    // real plain-CSS theme rules here; no network or copied token values.
    const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
    const alertRules = source('src/global.scss').match(/^ion-alert\s*\{[^}]*\}/m)?.[0];
    if (!alertRules) throw new Error('Global Ionic alert theme rules are missing');
    themeStyles = document.createElement('style');
    themeStyles.textContent = [source('src/theme/light.scss'), source('src/theme/dark.scss'), alertRules]
      .join('\n').replace(/^\s*\/\/.*$/gm, '');
    document.head.append(themeStyles);
  });
  afterAll(() => themeStyles.remove());

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    document.body.classList.remove('light', 'dark');
    delete document.documentElement.dataset['theme'];
    delete document.body.dataset['theme'];
  });

  it('uses light when no preference has been saved', () => {
    expect(readStoredTheme()).toBe('light');
  });

  it('applies the dark theme to the app document', () => {
    applyThemeToDocument('dark');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('light')).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('uses the selected theme surface for Ionic alerts', () => {
    applyThemeToDocument('dark');
    const alert = document.createElement('ion-alert');
    document.body.append(alert);

    expect(
      getComputedStyle(alert)
        .getPropertyValue('--ion-overlay-background-color')
        .trim(),
    ).toBe('var(--blinker-surface)');
    expect(
      getComputedStyle(alert).getPropertyValue('--ion-color-step-100').trim(),
    ).toBe('var(--blinker-surface-active)');
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--blinker-surface')
        .trim(),
    ).toBe('#102b43');
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--blinker-surface-active')
        .trim(),
    ).toBe('#0f395f');

    alert.remove();
  });

  it('persists and restores the selected theme', () => {
    saveTheme('dark');

    expect(readStoredTheme()).toBe('dark');
  });
});
