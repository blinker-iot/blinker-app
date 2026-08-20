import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WidgetVideoComponent } from './widget-video';

type HlsListener = (event: string, data?: { fatal?: boolean }) => void;

const hlsMock = vi.hoisted(() => ({
  instances: [] as Array<{
    listeners: Map<string, HlsListener>;
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    emit: (event: string, data?: { fatal?: boolean }) => void;
  }>,
}));

vi.mock('hls.js', () => {
  class MockHls {
    static readonly Events = {
      ERROR: 'hlsError',
      MANIFEST_PARSED: 'hlsManifestParsed',
    };

    readonly listeners = new Map<string, HlsListener>();
    readonly loadSource = vi.fn();
    readonly attachMedia = vi.fn();
    readonly destroy = vi.fn();

    constructor() {
      hlsMock.instances.push(this);
    }

    on(event: string, listener: HlsListener): void {
      this.listeners.set(event, listener);
    }

    emit(event: string, data?: { fatal?: boolean }): void {
      this.listeners.get(event)?.(event, data);
    }
  }

  return { default: MockHls };
});

describe('WidgetVideoComponent', () => {
  function createComponent(streamType: 'mjpg' | 'hls', url = '') {
    const component = new WidgetVideoComponent();
    component.widget = {
      key: 'camera',
      str: streamType,
      url,
      mode: 1,
      lstyle: 0,
    };
    component.device = { data: {} };
    return component;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    hlsMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no data for an empty URL and checks again after one second', () => {
    const component = createComponent('mjpg');
    component.ngOnInit();

    expect(component.hasError).toBe(true);
    expect(component.renderImage).toBe(false);

    component.widget.url = 'https://example.com/camera.mjpg';
    vi.advanceTimersByTime(999);
    expect(component.renderImage).toBe(false);

    vi.advanceTimersByTime(1);
    expect(component.renderImage).toBe(true);
    expect(component.hasError).toBe(true);

    component.onImageLoad();
    expect(component.hasError).toBe(false);
    component.ngOnDestroy();
  });

  it('recreates a failed image after one second', () => {
    const component = createComponent(
      'mjpg',
      'https://example.com/camera.mjpg'
    );
    component.ngOnInit();

    component.onImageError();
    expect(component.hasError).toBe(true);
    expect(component.renderImage).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(component.renderImage).toBe(true);
    component.ngOnDestroy();
  });

  it('recreates HLS after a fatal error and clears the error on success', () => {
    const component = createComponent(
      'hls',
      'https://example.com/live.m3u8'
    );
    component.video = new ElementRef(document.createElement('video'));
    component.ngOnInit();
    component.ngAfterViewInit();

    const firstHls = hlsMock.instances[0];
    expect(firstHls.loadSource).toHaveBeenCalledWith(
      'https://example.com/live.m3u8'
    );

    firstHls.emit('hlsError', { fatal: true });
    expect(component.hasError).toBe(true);
    expect(firstHls.destroy).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(999);
    expect(hlsMock.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(hlsMock.instances).toHaveLength(2);

    hlsMock.instances[1].emit('hlsManifestParsed');
    expect(component.hasError).toBe(false);
    expect(component.showVideo).toBe(true);
    component.ngOnDestroy();
  });

  it('leaves non-fatal HLS recovery to hls.js', () => {
    const component = createComponent(
      'hls',
      'https://example.com/live.m3u8'
    );
    component.video = new ElementRef(document.createElement('video'));
    component.ngOnInit();
    component.ngAfterViewInit();

    hlsMock.instances[0].emit('hlsError', { fatal: false });
    vi.advanceTimersByTime(1000);

    expect(component.hasError).toBe(false);
    expect(hlsMock.instances).toHaveLength(1);
    component.ngOnDestroy();
  });

  it('destroys HLS and ignores its late events after switching to MJPG', () => {
    const component = createComponent(
      'hls',
      'https://example.com/live.m3u8'
    );
    component.video = new ElementRef(document.createElement('video'));
    component.ngOnInit();
    component.ngAfterViewInit();
    const oldHls = hlsMock.instances[0];

    component.widget.str = 'mjpg';
    component.widget.url = 'https://example.com/camera.mjpg';
    component.refresh();
    oldHls.emit('hlsManifestParsed');

    expect(oldHls.destroy).toHaveBeenCalledOnce();
    expect(component.hls).toBeUndefined();
    expect(component.showVideo).toBe(false);
    expect(component.hasError).toBe(false);
    expect(component.renderImage).toBe(true);
    component.ngOnDestroy();
  });

  it('waits for the retry point before loading a new HLS URL after empty data', () => {
    const component = createComponent(
      'hls',
      'https://example.com/first.m3u8'
    );
    component.video = new ElementRef(document.createElement('video'));
    component.ngOnInit();
    component.ngAfterViewInit();
    const oldHls = hlsMock.instances[0];

    component.widget.url = '';
    component.ngDoCheck();
    expect(component.showNoData).toBe(true);
    expect(oldHls.destroy).toHaveBeenCalledOnce();

    component.widget.url = 'https://example.com/second.m3u8';
    component.ngDoCheck();
    vi.advanceTimersByTime(999);
    expect(hlsMock.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(hlsMock.instances).toHaveLength(2);
    expect(hlsMock.instances[1].loadSource).toHaveBeenCalledWith(
      'https://example.com/second.m3u8'
    );
    component.ngOnDestroy();
  });

  it('cancels a pending retry when destroyed', () => {
    const component = createComponent('mjpg');
    component.ngOnInit();
    component.ngOnDestroy();

    component.widget.url = 'https://example.com/camera.mjpg';
    vi.advanceTimersByTime(1000);

    expect(component.renderImage).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads live values using widget.key when no key input is provided', () => {
    const component = createComponent('mjpg', 'fallback');
    component.device.data.camera = { url: 'live-url' };

    expect(component.url).toBe('live-url');
  });

  it('renders the no-data icon instead of a removed fallback image', async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetVideoComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(WidgetVideoComponent);
    fixture.componentRef.setInput('widget', {
      key: 'camera',
      str: 'mjpg',
      url: '',
      mode: 1,
      lstyle: 0,
    });
    fixture.componentRef.setInput('device', { data: {} });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fa-empty-set')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    fixture.destroy();
  });
});
