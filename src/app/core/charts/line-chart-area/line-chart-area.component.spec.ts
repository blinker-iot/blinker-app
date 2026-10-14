import { ElementRef, SimpleChange } from '@angular/core';
import { LineChartAreaComponent } from './line-chart-area.component';

const chartMock = vi.hoisted(() => {
  const applyOptions = vi.fn();
  const setData = vi.fn();
  const fitContent = vi.fn();
  const remove = vi.fn();
  const areaSeries = { applyOptions, setData };
  const chart = {
    applyOptions: vi.fn(),
    addSeries: vi.fn(() => areaSeries),
    remove,
    timeScale: vi.fn(() => ({ fitContent })),
  };
  const createChart = vi.fn(() => chart);

  return {
    applyOptions,
    setData,
    fitContent,
    remove,
    areaSeries,
    chart,
    createChart,
  };
});

vi.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' },
  AreaSeries: {},
  createChart: chartMock.createChart,
}));

describe('LineChartAreaComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createComponent() {
    const component = new LineChartAreaComponent();
    const container = document.createElement('div');
    Object.defineProperty(container, 'offsetWidth', { value: 320 });
    Object.defineProperty(container, 'offsetHeight', { value: 180 });
    component.chartContainer = new ElementRef(container);
    component.color = '#389BEE';
    return component;
  }

  it('renders initial data as soon as the chart is ready', () => {
    const component = createComponent();
    component.data = [
      { date: new Date('2026-08-20T00:00:00Z'), value: 24.8 },
      { date: new Date('2026-08-20T00:05:00Z'), value: 26.4 },
    ];

    component.ngAfterViewInit();

    expect(chartMock.createChart).toHaveBeenCalledWith(
      component.chartContainer.nativeElement,
      expect.objectContaining({ width: 320, height: 180, autoSize: true })
    );
    expect(chartMock.setData).toHaveBeenLastCalledWith([
      { time: 1787184000, value: 24.8 },
      { time: 1787184300, value: 26.4 },
    ]);
    expect(chartMock.fitContent).toHaveBeenCalledOnce();
    component.ngOnDestroy();
  });

  it('updates the existing series whenever the data input changes', () => {
    const component = createComponent();
    component.data = [];
    component.ngAfterViewInit();

    const previousData = component.data;
    component.data = [
      { date: new Date('2026-08-20T01:00:00Z'), value: 58 },
    ];
    component.ngOnChanges({
      data: new SimpleChange(previousData, component.data, false),
    });

    expect(chartMock.createChart).toHaveBeenCalledOnce();
    expect(chartMock.setData).toHaveBeenLastCalledWith([
      { time: 1787187600, value: 58 },
    ]);
    component.ngOnDestroy();
  });

  it('updates canvas colors when the containing device theme changes', async () => {
    const component = createComponent();
    const parent = document.createElement('section');
    parent.append(component.chartContainer.nativeElement);
    document.body.append(parent);
    const style = component.chartContainer.nativeElement.style;
    style.setProperty('--blinker-text-secondary', '#b4c0cd');
    component.ngAfterViewInit();
    expect(chartMock.chart.applyOptions).toHaveBeenLastCalledWith(expect.objectContaining({ layout: { textColor: '#b4c0cd' } }));
    style.setProperty('--blinker-text-secondary', '#526780');
    parent.setAttribute('data-device-theme', 'clear');
    await vi.waitFor(() => expect(chartMock.chart.applyOptions).toHaveBeenLastCalledWith(expect.objectContaining({ layout: { textColor: '#526780' } })));
    component.ngOnDestroy();
    parent.remove();
  });
});
