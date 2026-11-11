import { getDeviceRoute } from './device-navigation';
import { defaultDeviceCardLayout } from '../deviceblock/device-card-presentation';
import type { BlinkerDevice } from '../../../core/model/device.model';

describe('device navigation', () => {
  it('builds the selected device page route', () => {
    expect(getDeviceRoute('preview-device')).toEqual([
      '/device',
      'preview-device',
    ]);
  });
});

describe('device card size', () => {
  const layoutFor = (device: unknown) => defaultDeviceCardLayout(device as BlinkerDevice);

  it('keeps an explicitly wide card wide without data', () => {
    expect(layoutFor({ config: { card: { layout: 'wide' } }, data: {} })).toBe('wide');
  });

  it('keeps an explicitly standard card standard as data and metrics change', () => {
    const device = { config: { card: { layout: 'standard', metrics: [] as { key: string }[] } },
      data: {} as Record<string, number> };

    expect(layoutFor(device)).toBe('standard');
    device.data = { a: 1, b: 2, c: 3, d: 4 };
    device.config.card.metrics = Object.keys(device.data).map(key => ({ key }));
    expect(layoutFor(device)).toBe('standard');
    device.data = {};
    expect(layoutFor(device)).toBe('standard');
  });

  it('infers a wide card from its configured metrics', () => {
    const device = { config: { card: {
      metrics: ['a', 'b', 'c'].map(key => ({ key })),
      actions: [{ key: 'power', label: '电源' }],
    } }, data: { a: 1, b: 2, c: 3 } };

    expect(layoutFor(device)).toBe('wide');
  });

  it('keeps an explicitly wide card wide when its data is cleared', () => {
    const device = { config: { card: { layout: 'wide' } }, data: { a: 1 } as Record<string, number> };

    expect(layoutFor(device)).toBe('wide');
    device.data = {};
    expect(layoutFor(device)).toBe('wide');
  });

  it('uses standard size for missing devices or missing layout', () => {
    expect(layoutFor({ config: {} })).toBe('standard');
    expect(defaultDeviceCardLayout(undefined)).toBe('standard');
  });
});
