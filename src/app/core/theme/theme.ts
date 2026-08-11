export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'blinker-theme';

export function readStoredTheme(): AppTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for the current session when storage is blocked.
  }
}

export function applyThemeToDocument(theme: AppTheme, target = document): void {
  const isDark = theme === 'dark';
  const root = target.documentElement;
  const body = target.body;

  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
  root.dataset['theme'] = theme;
  body.classList.toggle('dark', isDark);
  body.classList.toggle('light', !isDark);
  body.dataset['theme'] = theme;

  target.querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', theme);
  target.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#071b2e' : '#f7f9fc');
}
