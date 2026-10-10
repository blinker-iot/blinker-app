import { readDeviceTheme, saveDeviceTheme } from './device-theme';

describe('device theme preferences', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('restores each device independently without changing the app theme', () => {
    localStorage.setItem('blinker-theme', 'dark');
    expect(saveDeviceTheme('living-room', 'natural')).toBe(true);
    saveDeviceTheme('workshop', 'electronic');
    expect(readDeviceTheme('living-room')).toBe('natural');
    expect(readDeviceTheme('workshop')).toBe('electronic');
    expect(readDeviceTheme('new-device')).toBeUndefined();
    expect(localStorage.getItem('blinker-theme')).toBe('dark');
  });

  it('ignores invalid saved preferences', () => {
    localStorage.setItem('blinker-device-theme:test', 'unknown');
    expect(readDeviceTheme('test')).toBeUndefined();
  });

  it('can restore the original layout style without changing other devices', () => {
    saveDeviceTheme('first', 'natural');
    saveDeviceTheme('second', 'dark');
    expect(saveDeviceTheme('first', undefined)).toBe(true);
    expect(readDeviceTheme('first')).toBeUndefined();
    expect(readDeviceTheme('second')).toBe('dark');
  });

  it('handles unavailable storage without blocking the device page', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readDeviceTheme('test')).toBeUndefined();
    expect(saveDeviceTheme('test', 'natural')).toBe(false);
  });
});
