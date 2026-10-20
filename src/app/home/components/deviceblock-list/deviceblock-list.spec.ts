import { getDeviceRoute } from './device-navigation';
import { DeviceblockListComponent } from './deviceblock-list';

describe('device navigation', () => {
  it('builds the selected device page route', () => {
    expect(getDeviceRoute('preview-device')).toEqual([
      '/device',
      'preview-device',
    ]);
  });
});

describe('device card size', () => {
  const listFor = (device: unknown): DeviceblockListComponent => {
    const list = Object.create(DeviceblockListComponent.prototype) as DeviceblockListComponent;
    Object.defineProperty(list, 'deviceDataDict', { get: () => ({ device }) });
    Object.defineProperty(list, 'cardEditor', { value: { layout: (id: string) =>
      id === 'device' && (device as any)?.config?.card?.layout === 'wide' ? 'wide' : 'standard' } });
    return list;
  };

  it('keeps an explicitly wide card wide without data', () => {
    const list = listFor({ config: { card: { layout: 'wide' } }, data: {} });

    expect(list.isWideDevice('device')).toBe(true);
  });

  it('keeps an explicitly standard card standard as data and metrics change', () => {
    const device = { config: { card: { layout: 'standard', metrics: [] as { key: string }[] } },
      data: {} as Record<string, number> };
    const list = listFor(device);

    expect(list.isWideDevice('device')).toBe(false);
    device.data = { a: 1, b: 2, c: 3, d: 4 };
    device.config.card.metrics = Object.keys(device.data).map(key => ({ key }));
    expect(list.isWideDevice('device')).toBe(false);
    device.data = {};
    expect(list.isWideDevice('device')).toBe(false);
  });

  it('does not infer a wide card from metrics, actions or numeric data', () => {
    const list = listFor({ config: { card: {
      metrics: ['a', 'b', 'c'].map(key => ({ key })),
      actions: [{ key: 'power', label: '电源' }],
    } }, data: { a: 1, b: 2, c: 3 } });

    expect(list.isWideDevice('device')).toBe(false);
  });

  it('keeps an explicitly wide card wide when its data is cleared', () => {
    const device = { config: { card: { layout: 'wide' } }, data: { a: 1 } as Record<string, number> };
    const list = listFor(device);

    expect(list.isWideDevice('device')).toBe(true);
    device.data = {};
    expect(list.isWideDevice('device')).toBe(true);
  });

  it('uses standard size for missing devices or missing layout', () => {
    const list = listFor({ config: {} });

    expect(list.isWideDevice('device')).toBe(false);
    expect(list.isWideDevice('missing')).toBe(false);
  });
});
