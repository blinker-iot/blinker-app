import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LegacyPanelSizingDirective, measureLegacyPanel } from './legacy-panel-sizing.directive';

@Component({ imports: [LegacyPanelSizingDirective], template: '<section class="panel"><div class="cell" style="--span: 2; --rows: 2"></div></section>' })
class Host {}

describe('legacy WebView panel measurement', () => {
  afterEach(() => vi.unstubAllGlobals());
  const panel = (width: number) => {
    const element = document.createElement('section');
    element.innerHTML = '<div class="cell" style="--span: 2; --rows: 2"></div>';
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
    return element;
  };

  it('measures compact and wide frames without changing saved layout inputs', () => {
    const compact = panel(288), wide = panel(720);
    measureLegacyPanel(compact); measureLegacyPanel(wide);
    expect(compact.style.getPropertyValue('--legacy-row-h')).toBe('63px');
    expect(compact.dataset['legacyGrid']).toBe('compact');
    expect((compact.firstElementChild as HTMLElement).style.getPropertyValue('--legacy-span')).toBe('4');
    expect((compact.firstElementChild as HTMLElement).style.getPropertyValue('--span')).toBe('2');
    expect(wide.style.getPropertyValue('--legacy-row-h')).toBe('79.5px');
    expect(wide.dataset['legacyGrid']).toBe('wide');
  });

  it('ignores hidden frames and nested panels and caps wide spans', () => {
    const hidden = panel(0); measureLegacyPanel(hidden);
    expect(hidden.dataset['legacyGrid']).toBeUndefined();
    const visible = panel(288), cell = visible.firstElementChild as HTMLElement;
    cell.style.setProperty('--span', '8');
    cell.innerHTML = '<section><div class="cell" style="--span: 2"></div></section>';
    measureLegacyPanel(visible);
    expect(cell.style.getPropertyValue('--legacy-span')).toBe('8');
    expect((cell.querySelector('.cell') as HTMLElement).style.getPropertyValue('--legacy-span')).toBe('');
  });

  it('attaches to actual panel classes on old kernels and disconnects both observers', async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const disconnectResize = vi.fn(), disconnectChanges = vi.fn();
    let resize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect = disconnectResize; });
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect = disconnectChanges; });
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('.panel') as HTMLElement;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 288 } as DOMRect);
    resize([], {} as ResizeObserver);
    expect(element.dataset['legacyGrid']).toBe('compact');
    fixture.destroy();
    expect(disconnectResize).toHaveBeenCalledOnce(); expect(disconnectChanges).toHaveBeenCalledOnce();
  });

  it('does not attach observers or override layout on modern kernels', async () => {
    vi.stubGlobal('CSS', { supports: () => true });
    const observer = vi.fn(); vi.stubGlobal('ResizeObserver', observer);
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    expect(observer).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.panel').dataset.legacyGrid).toBeUndefined();
    fixture.destroy();
  });
});
