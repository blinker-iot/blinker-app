import {
  applyThemeToDocument,
  readStoredTheme,
  saveTheme,
} from './theme';

describe('app theme', () => {
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

  it('persists and restores the selected theme', () => {
    saveTheme('dark');

    expect(readStoredTheme()).toBe('dark');
  });
});
