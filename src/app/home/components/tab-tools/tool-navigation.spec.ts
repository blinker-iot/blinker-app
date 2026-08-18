import { navigateToTool } from './tool-navigation';

describe('navigateToTool', () => {
  it('stores the tools tab in history before opening a tool', async () => {
    const navigate = vi.fn().mockResolvedValue(true);
    const navigateForward = vi.fn().mockResolvedValue(true);

    await navigateToTool(
      { navigate },
      { navigateForward },
      '/tools/ble-debug'
    );

    expect(navigate).toHaveBeenCalledWith(['/home/tools'], {
      replaceUrl: true,
    });
    expect(navigateForward).toHaveBeenCalledWith('/tools/ble-debug');
    expect(navigate.mock.invocationCallOrder[0]).toBeLessThan(
      navigateForward.mock.invocationCallOrder[0]
    );
  });
});
