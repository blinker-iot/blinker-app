import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import {
  COMMON_WIDGET_OPTIONS, PAGE_WIDGET_TITLE_MAX_BYTES, PAGE_WIDGET_VARIANTS, VARIANT_WIDGET_OPTIONS,
  type PageWidgetType, type PageWidgetVariant,
} from '../../../core/device-v2/page-widget';
import { WidgetInspectorComponent } from './widget-inspector';

function inspector(overrides: Partial<PageLayoutWidget> = {}) {
  const component = new WidgetInspectorComponent();
  const original: PageLayoutWidget = { widgetId: 'old-id', type: 'value', variant: 'number', endpointKey: 'temperature',
    title: '原名称', grid: { x: 1, y: 6, width: 3, height: 5 }, options: { caption: '原说明', showTitle: false },
    extraKeys: ['humidity', 'voltage'], ...overrides };
  component.widget = original;
  const emitted: PageLayoutWidget[] = [];
  component.widgetChange.subscribe(widget => { emitted.push(widget); component.widget = widget; });
  return { component, original, emitted };
}

@Component({
  standalone: true,
  imports: [WidgetInspectorComponent],
  template: '<app-widget-inspector [widget]="widget" [disabled]="disabled()" />',
})
class InspectorFormHost {
  widget = inspector().original;
  disabled = signal(false);
}

describe('Widget Inspector validation and input draft contract', () => {
  it.each(['a'.repeat(64), '中'.repeat(21) + 'a', '😀'.repeat(16)])('accepts the exact title UTF-8 boundary without character truncation', title => {
    const { component, emitted } = inspector();
    component.setTitle(` ${title} `);
    expect(component.invalid.has('title')).toBe(false);
    expect(emitted.at(-1)?.title).toBe(title);
    expect(component.titleBytes).toBe(PAGE_WIDGET_TITLE_MAX_BYTES);
  });

  it.each(['a'.repeat(65), '中'.repeat(22), '😀'.repeat(17), 'bad\0title'])('retains an invalid title and blocks it from valid widget outputs', title => {
    const { component, emitted } = inspector();
    const invalid = vi.spyOn(component.invalidChange, 'emit');
    component.setTitle(title);
    expect(component.titleInput).toBe(title);
    expect(component.invalid.has('title')).toBe(true);
    expect(component.error('title')).not.toBe('');
    expect(emitted).toEqual([]);
    expect(invalid).toHaveBeenLastCalledWith(true);
    component.setOption('size', 'xl');
    expect(emitted.at(-1)?.title).toBe('原名称');
    expect(component.titleInput).toBe(title);
    expect(component.invalid.has('title')).toBe(true);
    component.widget = structuredClone(component.widget);
    expect(component.titleInput).toBe(title);
    component.setTitle('已修正');
    expect(invalid).toHaveBeenLastCalledWith(false);
    expect(emitted.at(-1)?.title).toBe('已修正');
  });

  it('clears a whitespace title to the existing fallback without touching grid or binding', () => {
    const { component, original, emitted } = inspector();
    component.setTitle('   ');
    expect(emitted[0].title).toBeUndefined();
    expect(emitted[0].grid).toEqual(original.grid);
    expect(emitted[0].endpointKey).toBe(original.endpointKey);
    expect(emitted[0].extraKeys).toEqual(original.extraKeys);
  });

  it('retains invalid option raw text through another valid edit and same-widget input references', () => {
    const { component, emitted } = inspector();
    component.setOption('decimals', '2.5');
    expect(component.text('decimals')).toBe('2.5');
    expect(component.invalid.has('decimals')).toBe(true);
    component.setTitle('新标题');
    component.setOption('size', 'xl');
    component.widget = structuredClone(component.widget);
    expect(component.text('decimals')).toBe('2.5');
    expect(component.invalid.has('decimals')).toBe(true);
    expect(emitted.every(widget => widget.options?.decimals === undefined)).toBe(true);
    component.setOption('decimals', '0');
    expect(component.options.decimals).toBe(0);
    expect(component.invalid.size).toBe(0);
  });

  it('keeps common errors when switching skin, but drops only unsupported specific drafts', () => {
    const { component } = inspector();
    component.setTitle('中'.repeat(22));
    component.setOption('caption', '😀'.repeat(17));
    component.setOption('decimals', '9');
    component.setOption('scale', '0');
    component.setVariant('status');
    expect([...component.invalid].sort()).toEqual(['caption', 'title']);
    expect(component.titleInput).toBe('中'.repeat(22));
    expect(component.text('caption')).toBe('😀'.repeat(17));
    expect(component.options).toMatchObject({ caption: '原说明', showTitle: false });
    expect(component.options.decimals).toBeUndefined();
    expect(component.options.scale).toBeUndefined();
  });

  it('keeps a specific invalid field if the new skin still supports it', () => {
    const { component } = inspector();
    component.setOption('decimals', '9');
    component.setVariant('ring');
    expect(component.text('decimals')).toBe('9');
    expect(component.invalid.has('decimals')).toBe(true);
  });

  it('updates validity before publishing a new skin without requiring an Input echo', () => {
    const component = new WidgetInspectorComponent();
    const original = inspector().original;
    component.widget = original;
    component.setOption('decimals', '9');
    const events: string[] = [];
    component.invalidChange.subscribe(invalid => events.push(`invalid:${invalid}`));
    component.widgetChange.subscribe(widget => events.push(`widget:${widget.variant}`));
    component.setVariant('status');
    expect(events).toEqual(['invalid:false', 'widget:status']);
    expect(component.invalid.size).toBe(0);
    expect(component.widget).toBe(original);
  });

  it('preserves a legacy grid when the already selected appearance is clicked', () => {
    const { component, original, emitted } = inspector();
    component.setVariant('number');
    expect(emitted).toEqual([]);
    expect(component.widget).toBe(original);
    expect(component.widget.grid).toEqual({ x: 1, y: 6, width: 3, height: 5 });
  });

  it('drops incompatible enum subsets only on an explicit skin change, retaining other compatible options', () => {
    const { component } = inspector({ type: 'slider', variant: 'levels', options: { style: 'bars', showButtons: false, caption: '保留' } });
    component.setVariant('timer');
    expect(component.options.style).toBeUndefined();
    expect(component.options.showButtons).toBeUndefined();
    expect(component.options.caption).toBe('保留');
  });

  it('preserves default / true / false and distinguishes empty numeric input from explicit 0', () => {
    const { component } = inspector();
    component.setOption('showTitle', true);
    expect(component.options.showTitle).toBe(true);
    component.setOption('showTitle', false);
    expect(component.options.showTitle).toBe(false);
    component.setOption('showTitle', undefined);
    expect(Object.hasOwn(component.options, 'showTitle')).toBe(false);
    component.setOption('decimals', '0');
    expect(component.options.decimals).toBe(0);
    component.setOption('decimals', '');
    expect(Object.hasOwn(component.options, 'decimals')).toBe(false);
  });

  it('keeps number badInput invalid instead of treating its empty DOM value as a default', () => {
    const { component, emitted } = inspector();
    component.setOption('decimals', '', true);
    expect(component.invalid.has('decimals')).toBe(true);
    expect(emitted).toEqual([]);
    component.setOption('decimals', '');
    expect(component.invalid.size).toBe(0);
    expect(emitted.at(-1)?.options?.decimals).toBeUndefined();
  });

  it('guards the existing min/max pair and accepts a correction without losing either draft', () => {
    const { component, emitted } = inspector({ variant: 'ring', options: { min: 0, max: 10 } });
    component.setOption('min', '20');
    expect(component.invalid.has('min')).toBe(true);
    expect(component.invalid.has('max')).toBe(true);
    expect(emitted).toEqual([]);
    component.setTitle('范围');
    expect(component.text('min')).toBe('20');
    expect(emitted.at(-1)?.options).toEqual({ min: 0, max: 10 });
    component.setOption('max', '30');
    expect(component.invalid.size).toBe(0);
    expect(emitted.at(-1)?.options).toEqual({ min: 20, max: 30 });
  });

  it('retains the positive total memory rule and the empty unknown-capacity fallback', () => {
    const { component, emitted } = inspector({ variant: 'memory', options: undefined, extraKeys: undefined });
    component.setOption('max', '0');
    expect(component.error('max')).toContain('大于 0');
    expect(emitted).toEqual([]);
    component.setOption('max', '');
    expect(component.invalid.size).toBe(0);
    expect(emitted.at(-1)?.options).toBeUndefined();
  });

  it('does not submit partial IME composition and validates the completed title and option', () => {
    const { component, emitted } = inspector();
    component.beginComposition('title');
    component.setTitle('中');
    expect(component.invalid.has('title')).toBe(true);
    expect(emitted).toEqual([]);
    component.endComposition('title', '中文');
    expect(component.widget.title).toBe('中文');
    component.beginComposition('caption');
    expect(component.invalid.has('caption')).toBe(true);
    component.setOption('caption', '说');
    expect(component.widget.options?.caption).toBe('原说明');
    component.endComposition('caption', '说明');
    expect(component.options.caption).toBe('说明');
    expect(component.invalid.size).toBe(0);
  });

  it('drops local invalid drafts on a new widget identity or an explicit new session only', () => {
    const { component } = inspector();
    component.setTitle('中'.repeat(22));
    component.setOption('decimals', '9');
    component.draftVersion = 1;
    expect(component.titleInput).toBe('原名称');
    expect(component.invalid.size).toBe(0);
    component.setTitle('中'.repeat(22));
    component.widget = { ...component.widget, widgetId: 'another' };
    expect(component.titleInput).toBe('原名称');
    expect(component.invalid.size).toBe(0);
  });

  it('does not mutate raw inputs or emit edits while saving has disabled the form', () => {
    const { component, emitted } = inspector();
    component.setTitle('中'.repeat(22));
    const invalid = vi.spyOn(component.invalidChange, 'emit');
    component.disabled = true;
    component.setTitle('new'); component.setOption('decimals', '2'); component.setSize(4, 2);
    component.setVariant('ring'); component.toggleExtra('humidity'); component.beginComposition('title');
    component.endComposition('title', 'new');
    expect(component.titleInput).toBe('中'.repeat(22));
    expect(emitted).toEqual([]);
    expect(invalid).not.toHaveBeenCalled();
  });

  it('gives separate rendered inspectors unique field IDs, without changing document identity', () => {
    const a = inspector().component; const b = inspector().component;
    expect(a.fieldId('title')).not.toBe(b.fieldId('title'));
    expect(a.widget.widgetId).toBe(b.widget.widgetId);
  });

  for (const [type, variants] of Object.entries(PAGE_WIDGET_VARIANTS)) {
    for (const variant of variants) {
      it(`groups every existing ${type}/${variant} option exactly once without materializing defaults`, () => {
        const { component, original, emitted } = inspector({ type: type as PageWidgetType, variant: variant as PageWidgetVariant });
        const groups = [...component.commonOptions, ...component.currentOptions, ...component.advancedOptions, 'icon', 'tone'];
        expect(groups.sort()).toEqual([...COMMON_WIDGET_OPTIONS, ...VARIANT_WIDGET_OPTIONS[variant as PageWidgetVariant]].sort());
        expect(new Set(groups).size).toBe(groups.length);
        expect(component.widget).toBe(original);
        expect(emitted).toEqual([]);
      });
    }
  }
});

describe('Widget Inspector actual form template', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    await TestBed.configureTestingModule({ imports: [InspectorFormHost] }).compileComponents();
    const fixture = TestBed.createComponent(InspectorFormHost);
    fixture.detectChanges();
    const element = fixture.debugElement.query(By.directive(WidgetInspectorComponent));
    return { fixture, component: element.componentInstance as WidgetInspectorComponent, host: element.nativeElement as HTMLElement };
  }

  it('uses input-time UTF-8 validation with a specific linked error and no maxlength truncation', async () => {
    const { fixture, component, host } = await render();
    const input = host.querySelector<HTMLInputElement>('input[data-field="title"]')!;
    expect(input.hasAttribute('maxlength')).toBe(false);
    input.value = '中'.repeat(22); input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(input.value).toBe('中'.repeat(22));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = host.querySelector<HTMLElement>(`#${component.fieldId('title')}-error`)!;
    expect(error.textContent).toContain('64 UTF-8');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    expect(host.querySelector('.error-summary')?.textContent).toContain('当前输入已保留');
    fixture.destroy();
  });

  it('keeps common fields visible and appearance / advanced JSON collapsed and read-only', async () => {
    const { fixture, host } = await render();
    expect(host.querySelector('.common-group [data-option="caption"]')).not.toBeNull();
    expect(host.querySelector('.common-group [data-option="showTitle"]')).not.toBeNull();
    expect(host.querySelector<HTMLDetailsElement>('.appearance-group')?.open).toBe(false);
    expect(host.querySelector<HTMLDetailsElement>('.advanced-group')?.open).toBe(false);
    expect(host.querySelector<HTMLDetailsElement>('.json-details')?.open).toBe(false);
    expect(host.querySelector('.json')?.tagName).toBe('PRE');
    expect(host.querySelector('.binding-summary input')).toBeNull();
    expect(host.querySelector('iframe')).toBeNull();
    fixture.destroy();
  });

  it('opens the containing disclosure and focuses the first invalid field on request only', async () => {
    const { fixture, component, host } = await render();
    const input = host.querySelector<HTMLInputElement>(`#${component.fieldId('scale')}`)!;
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.invalid.has('scale')).toBe(true);
    const focus = vi.spyOn(input, 'focus');
    expect(focus).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.error-summary button')!.click();
    expect(host.querySelector<HTMLDetailsElement>('.advanced-group')?.open).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('renders disabled editing controls while retaining read-only advanced disclosure access', async () => {
    const { fixture, component, host } = await render();
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.disabled).toBe(true);
    expect(host.querySelector<HTMLFieldSetElement>('.inspector-fields')?.disabled).toBe(true);
    expect(host.querySelector('.advanced-group > summary')).not.toBeNull();
    fixture.destroy();
  });
});
