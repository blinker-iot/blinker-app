import { Subject } from 'rxjs';
import type { BlinkerDevice } from 'src/app/core/model/device.model';
import type { CloudStorageService } from 'src/app/core/services/cloudStorage.service';
import type { LayouterService } from '../../../layouter.service';
import { WidgetChartComponent } from './widget-chart';

vi.mock('src/app/core/services/cloudStorage.service', () => ({
  CloudStorageService: class {},
}));

describe('WidgetChartComponent', () => {
  function createComponent() {
    const getTimeSeriesData = vi.fn();
    const component = new WidgetChartComponent(
      { getTimeSeriesData } as unknown as CloudStorageService,
      { action: new Subject() } as unknown as LayouterService
    );
    component.device = {
      deviceName: 'chart-test-device',
      config: { mode: 'mqtt' },
      data: {},
    } as BlinkerDevice;
    component.widget = {
      type: 'cha',
      key: 'environmentHistory',
      key0: 'temperature',
      clr: '#389BEE',
    };

    return { component, getTimeSeriesData };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('loads ascending virtual data without requesting the cloud in demo mode', () => {
    const { component, getTimeSeriesData } = createComponent();
    component.isDemo = true;

    component.ngOnInit();
    component.ngAfterViewInit();
    vi.advanceTimersByTime(1000);

    expect(component.quickCode).toBe('1h');
    expect(component.data).toHaveLength(12);
    expect(component.data.every((point) => point.date instanceof Date)).toBe(
      true
    );
    expect(
      component.data.every(
        (point, index, data) =>
          index === 0 || point.date.getTime() > data[index - 1].date.getTime()
      )
    ).toBe(true);
    expect(component.data.every((point) => Number.isFinite(point.value))).toBe(
      true
    );

    component.quickCode = 'rt';
    component.changeQuickCode();
    component.changeKey('humidity');

    expect(component.data).toHaveLength(12);
    expect(getTimeSeriesData).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('also uses virtual data for test devices', () => {
    const { component, getTimeSeriesData } = createComponent();
    component.device.config.mode = 'test';

    component.ngOnInit();
    component.ngAfterViewInit();
    vi.advanceTimersByTime(1000);

    expect(component.data).toHaveLength(12);
    expect(getTimeSeriesData).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('uses the bundled history of preview devices without requesting the cloud', () => {
    const { component, getTimeSeriesData } = createComponent();
    const now = Math.floor(Date.now() / 1000);
    component.device.config.isPreview = true;
    component.device.data.history = {
      temperature: {
        '1h': [
          { date: now - 300, value: 24.8 },
          { date: now, value: 26.4 },
        ],
        '1d': [{ date: now, value: 27.2 }],
      },
    };

    component.ngOnInit();
    component.ngAfterViewInit();
    vi.advanceTimersByTime(1000);

    expect(component.data.map((point) => point.value)).toEqual([24.8, 26.4]);
    expect(component.data[0].date).toEqual(new Date((now - 300) * 1000));

    component.quickCode = '1d';
    component.changeQuickCode();

    expect(component.data.map((point) => point.value)).toEqual([27.2]);
    expect(getTimeSeriesData).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('keeps production data empty until its normal data load runs', () => {
    const { component } = createComponent();

    component.ngOnInit();

    expect(component.data).toEqual([]);
    component.ngOnDestroy();
  });

  it('starts realtime updates without an account-level restriction', () => {
    const { component } = createComponent();
    component.selectedKey = 'temperature';
    const timestamp = Math.floor(Date.now() / 1000);
    component.device.data.temperature = {
      val: 26.4,
      date: timestamp,
    };

    component.renderRtChart();
    vi.advanceTimersByTime(1000);

    expect(component.data).toHaveLength(1);
    expect(component.data[0].value).toBe(26.4);

    component.device.data.temperature.val = 27.1;
    vi.advanceTimersByTime(1000);

    expect(component.data).toHaveLength(1);
    expect(component.data[0]).toEqual({
      date: new Date(timestamp * 1000),
      value: 27.1,
    });

    component.device.data.temperature = {
      val: 27.6,
      date: timestamp + 1,
    };
    vi.advanceTimersByTime(1000);

    expect(component.data).toHaveLength(2);
    expect(component.data[1].date.getTime()).toBeGreaterThan(
      component.data[0].date.getTime()
    );
    component.ngOnDestroy();
  });
});
