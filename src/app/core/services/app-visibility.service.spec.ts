import { describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  getState: vi.fn(),
  remove: vi.fn(),
  listener: undefined as ((state: { isActive: boolean }) => void) | undefined,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: plugin.addListener,
    getState: plugin.getState,
  },
}));

import { AppVisibilityService } from './app-visibility.service';

describe('AppVisibilityService', () => {
  it('publishes native foreground state and removes its single listener', async () => {
    plugin.remove.mockReset().mockResolvedValue(undefined);
    plugin.getState.mockReset().mockResolvedValue({ isActive: true });
    plugin.addListener.mockReset().mockImplementation(async (
      _event: string,
      listener: (state: { isActive: boolean }) => void,
    ) => {
      plugin.listener = listener;
      return { remove: plugin.remove };
    });
    const service = new AppVisibilityService({
      run: (callback: () => void) => callback(),
    } as any);

    await vi.waitFor(() => expect(plugin.getState).toHaveBeenCalledOnce());
    plugin.listener?.({ isActive: false });
    expect(service.active.value).toBe(false);
    plugin.listener?.({ isActive: true });
    expect(service.active.value).toBe(true);

    service.ngOnDestroy();
    expect(plugin.remove).toHaveBeenCalledOnce();
    plugin.listener?.({ isActive: false });
    expect(service.active.value).toBe(true);
  });
});
