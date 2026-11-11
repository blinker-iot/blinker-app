import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { PageWidgetComponent } from '../../../device/v2/panel/page-widget';
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';
import { InlineWidgetPropertiesComponent } from './inline-widget-properties';

function savedCard(): PanelCard {
  return {
    widget: { widgetId: 'reading', endpointKey: 'temperature', type: 'value', variant: 'number',
      title: '原温度', grid: { x: 4, y: 6, width: 2, height: 2 }, extraKeys: ['voltage'],
      options: { decimals: 1, caption: '原说明', showDelta: false } },
    field: { id: 1, key: 'temperature', role: 'property', valueType: 'number', readable: true,
      writable: false, notifies: true },
    extras: [{ field: { id: 2, key: 'voltage', role: 'property', valueType: 'number', readable: true,
      writable: false, notifies: true }, value: 3.3 }],
    value: 24, display: '24', draft: '', error: '', disabled: false,
  };
}

describe('inline properties have one local draft and no persistence owner', () => {
  it('derives unapplied changes from the current draft, without latching edits or emitting intent', () => {
    const component = new InlineWidgetPropertiesComponent();
    const applied = vi.fn(), canceled = vi.fn(), removed = vi.fn(), moved = vi.fn();
    component.applied.subscribe(applied); component.canceled.subscribe(canceled);
    component.removed.subscribe(removed); component.moved.subscribe(moved);
    expect(component.hasUnappliedChanges).toBe(false);
    const card = savedCard(), original = structuredClone(card);
    component.card = card;
    expect(component.hasUnappliedChanges).toBe(false);
    component.updateWidget({ ...component.widget!, title: '未应用标题' });
    expect(component.hasUnappliedChanges).toBe(true);
    component.updateWidget(structuredClone(card.widget));
    expect(component.hasUnappliedChanges).toBe(false);
    component.invalid = true;
    expect(component.hasUnappliedChanges).toBe(true);
    component.invalid = false;
    expect(component.hasUnappliedChanges).toBe(false);
    expect(card).toEqual(original);
    for (const intent of [applied, canceled, removed, moved]) expect(intent).not.toHaveBeenCalled();
  });

  it('clones all widget presentation data without fitting a historical size', () => {
    const component = new InlineWidgetPropertiesComponent();
    const card = savedCard();
    card.widget.grid = { x: 1, y: 9, width: 3, height: 5 };
    component.card = card;
    expect(component.widget).toEqual(card.widget);
    expect(component.widget).not.toBe(card.widget);
    expect(component.widget!.grid).not.toBe(card.widget.grid);
    expect(component.widget!.options).not.toBe(card.widget.options);
    expect(component.widget!.extraKeys).not.toBe(card.widget.extraKeys);
  });

  it('updates fresh State without replacing valid or invalid property drafts', () => {
    const component = new InlineWidgetPropertiesComponent();
    const card = savedCard();
    component.card = card;
    component.updateWidget({ ...component.widget!, title: '草稿温度' });
    component.invalid = true;
    const version = component.draftVersion;
    component.card = { ...card, widget: structuredClone(card.widget), value: 25, display: '25' };
    expect(component.widget!.title).toBe('草稿温度');
    expect(component.invalid).toBe(true);
    expect(component.draftVersion).toBe(version);
    expect(component.previewCard!.value).toBe(25);
    expect(card.widget.title).toBe('原温度');
    expect(component.hasUnappliedChanges).toBe(true);
  });

  it('starts a new local draft when the parent selects another widget or source configuration', () => {
    const component = new InlineWidgetPropertiesComponent();
    const card = savedCard();
    component.card = card;
    component.invalid = true;
    const version = component.draftVersion;
    component.card = { ...card, widget: { ...card.widget, widgetId: 'other', title: '另一个部件' } };
    expect(component.widget!.widgetId).toBe('other');
    expect(component.invalid).toBe(false);
    expect(component.draftVersion).toBe(version + 1);
    expect(component.hasUnappliedChanges).toBe(false);
    component.card = { ...component.card, widget: { ...component.card.widget, title: '源布局更新' } };
    expect(component.widget!.title).toBe('源布局更新');
  });

  it('emits only a detached valid widget; the parent still owns applying and saving', () => {
    const component = new InlineWidgetPropertiesComponent();
    const card = savedCard();
    component.card = card;
    const applied = vi.fn();
    component.applied.subscribe(applied);
    component.updateWidget({ ...component.widget!, title: '草稿' });
    component.invalid = true;
    component.apply();
    expect(applied).not.toHaveBeenCalled();
    component.invalid = false;
    component.apply();
    expect(applied).toHaveBeenCalledExactlyOnceWith(component.widget);
    expect(applied.mock.calls[0][0]).not.toBe(component.widget);
    expect(applied.mock.calls[0][0].grid).not.toBe(component.widget!.grid);
    expect(card.widget.title).toBe('原温度');
  });

  it('does not emit an applied draft while the host session is disabled', () => {
    const component = new InlineWidgetPropertiesComponent(); component.card = savedCard();
    component.updateWidget({ ...component.widget!, title: '保留草稿' });
    const applied = vi.fn(); component.applied.subscribe(applied); component.disabled = true;
    component.apply(); expect(applied).not.toHaveBeenCalled();
    expect(component.widget!.title).toBe('保留草稿');
  });
});

describe('inline property body reuses the real Inspector and readonly preview', () => {
  async function render(theme: 'natural' | 'dark' | 'electronic' = 'natural') {
    await TestBed.configureTestingModule({ imports: [InlineWidgetPropertiesComponent] }).compileComponents();
    const fixture = TestBed.createComponent(InlineWidgetPropertiesComponent);
    fixture.componentRef.setInput('card', savedCard());
    fixture.componentRef.setInput('theme', theme);
    fixture.componentRef.setInput('extraCandidates', [{ key: 'voltage', label: '电压', role: 'property', valueType: 'number' }]);
    fixture.detectChanges();
    const inputTitle = (value: string) => {
      const input = fixture.nativeElement.querySelector('input[data-field="title"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    return { fixture, inputTitle };
  }

  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))));
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  for (const theme of ['natural', 'dark', 'electronic'] as const) {
    it(`retains the ${theme} theme, grid and all original Inspector groups`, async () => {
      const { fixture } = await render(theme);
      expect(fixture.nativeElement.getAttribute('data-ui-theme')).toBe(theme);
      const cell = fixture.nativeElement.querySelector('.preview-region .cell') as HTMLElement;
      expect(cell.style.getPropertyValue('--span')).toBe('2');
      expect(cell.style.getPropertyValue('--rows')).toBe('2');
      for (const selector of ['.common-group', '.appearance-group', '.current-group', '.advanced-group']) {
        expect(fixture.nativeElement.querySelector(selector)).not.toBeNull();
      }
      const inspector = fixture.debugElement.query(By.directive(WidgetInspectorComponent)).componentInstance as WidgetInspectorComponent;
      expect(inspector.extraCandidates).toEqual([{ key: 'voltage', label: '电压', role: 'property', valueType: 'number' }]);
      const preview = fixture.debugElement.query(By.directive(PageWidgetComponent)).componentInstance as PageWidgetComponent;
      expect(preview.interactive).toBe(false);
      expect(fixture.nativeElement.querySelector('app-page-widget').hasAttribute('inert')).toBe(true);
      const action = vi.fn();
      preview.action.subscribe(action);
      preview.emit({ kind: 'toggle' });
      expect(action).not.toHaveBeenCalled();
    });
  }

  it('blocks applying invalid UTF-8 input while preserving it across fresh State and parent failure', async () => {
    const { fixture, inputTitle } = await render();
    const applied = vi.fn();
    fixture.componentInstance.applied.subscribe(applied);
    const title = '温'.repeat(22);
    inputTitle(title);
    expect(fixture.componentInstance.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('button.apply').disabled).toBe(true);
    fixture.componentInstance.apply();
    expect(applied).not.toHaveBeenCalled();
    fixture.componentRef.setInput('card', { ...savedCard(), value: 26, display: '26' });
    fixture.componentRef.setInput('error', '布局已改变，草稿已保留');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[data-field="title"]').value).toBe(title);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('草稿已保留');
    inputTitle('0');
    fixture.nativeElement.querySelector('button.apply').click();
    expect(applied).toHaveBeenCalledOnce();
    expect(applied.mock.calls[0][0].title).toBe('0');
    expect(fixture.componentInstance.card.widget.title).toBe('原温度');
  });

  it('protects invalid UTF-8 raw input across State updates and becomes clean when repaired to the original title', async () => {
    const { fixture, inputTitle } = await render();
    const component = fixture.componentInstance, applied = vi.fn();
    component.applied.subscribe(applied);
    inputTitle('温'.repeat(22));
    expect(component.invalid).toBe(true);
    expect(component.widget).toEqual(savedCard().widget);
    expect(component.hasUnappliedChanges).toBe(true);
    const version = component.draftVersion;
    fixture.componentRef.setInput('card', { ...savedCard(), value: 27, display: '27' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[data-field="title"]').value).toBe('温'.repeat(22));
    expect(component.hasUnappliedChanges).toBe(true);
    expect(component.draftVersion).toBe(version);
    inputTitle(savedCard().widget.title!);
    expect(component.invalid).toBe(false);
    expect(component.hasUnappliedChanges).toBe(false);
    expect(component.card.widget).toEqual(savedCard().widget);
    expect(applied).not.toHaveBeenCalled();
  });

  it('protects numeric badInput independently of the valid widget and clears protection after repair to the original value', async () => {
    const { fixture } = await render();
    const component = fixture.componentInstance, applied = vi.fn();
    component.applied.subscribe(applied);
    const inspector = fixture.debugElement.query(By.directive(WidgetInspectorComponent)).componentInstance as WidgetInspectorComponent;
    // Browsers may expose a partial numeric edit as an empty value with badInput.
    inspector.setOption('decimals', '', true);
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
    expect(component.invalid).toBe(true);
    expect(component.widget).toEqual(savedCard().widget);
    expect(component.hasUnappliedChanges).toBe(true);
    inspector.setOption('decimals', '1');
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
    expect(component.invalid).toBe(false);
    expect(component.hasUnappliedChanges).toBe(false);
    inspector.setOption('decimals', '2');
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
    expect(component.hasUnappliedChanges).toBe(true);
    inspector.setOption('decimals', '1');
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
    expect(component.hasUnappliedChanges).toBe(false);
    expect(component.card.widget).toEqual(savedCard().widget);
    expect(applied).not.toHaveBeenCalled();
  });

  it('cancel and remove emit intent only, even when the local form is invalid', async () => {
    const { fixture, inputTitle } = await render();
    const applied = vi.fn(), canceled = vi.fn(), removed = vi.fn();
    fixture.componentInstance.applied.subscribe(applied);
    fixture.componentInstance.canceled.subscribe(canceled);
    fixture.componentInstance.removed.subscribe(removed);
    inputTitle('a'.repeat(65));
    fixture.nativeElement.querySelector('button.cancel').click();
    expect(canceled).toHaveBeenCalledOnce();
    fixture.nativeElement.querySelector('.remove-button').click();
    expect(removed).toHaveBeenCalledOnce();
    expect(applied).not.toHaveBeenCalled();
    expect(fixture.componentInstance.card.widget.title).toBe('原温度');
    expect(fixture.nativeElement.querySelector('.save-scope').textContent).toContain('草稿');
  });
});
