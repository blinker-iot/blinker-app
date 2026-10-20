import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  getState: vi.fn(),
  remove: vi.fn(),
  listeners: new Map<string, (state?: { isActive: boolean }) => void>(),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: plugin.addListener,
    getState: plugin.getState,
  },
}));

import { AppVisibilityService } from './app-visibility.service';

describe('AppVisibilityService', () => {
  beforeEach(() => {
    plugin.listeners.clear();
    plugin.remove.mockReset().mockResolvedValue(undefined);
    plugin.getState.mockReset().mockResolvedValue({ isActive: true });
    plugin.addListener.mockReset().mockImplementation(async (
      event: string,
      listener: (state?: { isActive: boolean }) => void,
    ) => {
      plugin.listeners.set(event, listener);
      return { remove: plugin.remove };
    });
  });
  const create = () => new AppVisibilityService({ run: (callback: () => void) => callback() } as any);

  it('publishes native foreground state and removes both listeners', async () => {
    const service = new AppVisibilityService({
      run: (callback: () => void) => callback(),
    } as any);

    await vi.waitFor(() => expect(plugin.getState).toHaveBeenCalledOnce());
    plugin.listeners.get('appStateChange')?.({ isActive: false });
    expect(service.active.value).toBe(false);
    plugin.listeners.get('appStateChange')?.({ isActive: true });
    expect(service.active.value).toBe(true);

    service.ngOnDestroy();
    expect(plugin.remove).toHaveBeenCalledTimes(2);
    plugin.listeners.get('appStateChange')?.({ isActive: false });
    expect(service.active.value).toBe(true);
  });

  it('releases on pause before the delayed Android stopped event and resumes normally', async () => {
    const service = create();
    await vi.waitFor(() => expect(plugin.getState).toHaveBeenCalledOnce());
    plugin.listeners.get('pause')?.();
    expect(service.active.value).toBe(false);
    plugin.listeners.get('appStateChange')?.({ isActive: false });
    plugin.listeners.get('appStateChange')?.({ isActive: true });
    expect(service.active.value).toBe(true);
    service.ngOnDestroy();
  });

  it('late getState cannot resurrect a paused page or override a resumed page', async () => {
    let resolve!: (state: { isActive: boolean }) => void;
    plugin.getState.mockImplementation(() => new Promise(done => { resolve = done; }));
    const service = create();
    await vi.waitFor(() => expect(plugin.getState).toHaveBeenCalledOnce());
    plugin.listeners.get('pause')?.();
    resolve({ isActive: true });
    await Promise.resolve();
    expect(service.active.value).toBe(false);
    plugin.listeners.get('appStateChange')?.({ isActive: true });
    expect(service.active.value).toBe(true);
    service.ngOnDestroy();
  });

  it('pause during listener setup is not overridden by onStop-lagging native state', async () => {
    const service = create();
    plugin.listeners.get('pause')?.();
    await vi.waitFor(() => expect(plugin.getState).toHaveBeenCalledOnce());
    expect(service.active.value).toBe(false);
    service.ngOnDestroy();
  });

  it('destroy during registration removes late handles without querying native state', async () => {
    const service = create();
    service.ngOnDestroy();
    await vi.waitFor(() => expect(plugin.remove).toHaveBeenCalledTimes(2));
    expect(plugin.getState).not.toHaveBeenCalled();
  });

  it('unsupported browser listeners keep the existing snapshot fallback', async () => {
    plugin.addListener.mockImplementation(() => { throw Error('unsupported'); });
    plugin.getState.mockResolvedValue({ isActive: false });
    const service = create();
    await vi.waitFor(() => expect(service.active.value).toBe(false));
    service.ngOnDestroy();
    expect(plugin.remove).not.toHaveBeenCalled();
  });
});
