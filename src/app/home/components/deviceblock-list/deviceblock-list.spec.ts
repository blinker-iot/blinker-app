import { getDeviceRoute } from './device-navigation';

describe('device navigation', () => {
  it('builds the selected device page route', () => {
    expect(getDeviceRoute('preview-device')).toEqual([
      '/device',
      'preview-device',
    ]);
  });
});
