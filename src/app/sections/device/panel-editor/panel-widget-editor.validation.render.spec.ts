import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { IonButton, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';
import { PanelWidgetEditorContextService, type PanelWidgetEditorContext } from './panel-widget-editor-context.service';
import { PanelWidgetEditorPage } from './panel-widget-editor.page';

describe('UI4 production property page invalid and whole-page save wiring', () => {
  async function render() {
    const card: PanelCard = {
      widget: { widgetId: 'saved-reading', endpointKey: 'temperature', type: 'value', variant: 'number',
        title: '已保存标题', grid: { x: 4, y: 6, width: 2, height: 2 }, options: { decimals: 0, showDelta: false } },
      field: { id: 1, key: 'temperature', role: 'property', valueType: 'number', readable: true,
        writable: false, notifies: true }, value: 0, display: '0', draft: '', error: '', disabled: true,
    };
    const context: PanelWidgetEditorContext = {
      deviceId: 'device-one', widgetId: card.widget.widgetId, card, theme: 'dark', extraCandidates: [], error: '',
      preview: widget => ({ ...card, widget }), save: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(false), canLeave: vi.fn().mockResolvedValue(true),
    };
    await TestBed.configureTestingModule({ imports: [PanelWidgetEditorPage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (key: string) => key === 'id' ? context.deviceId : context.widgetId } } } },
      { provide: NavController, useValue: { navigateBack: vi.fn().mockResolvedValue(true) } },
    ] }).compileComponents();
    TestBed.inject(PanelWidgetEditorContextService).set(context);
    const fixture = TestBed.createComponent(PanelWidgetEditorPage);
    fixture.componentInstance.ionViewWillEnter();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const inspector = () => fixture.debugElement.query(By.directive(WidgetInspectorComponent)).componentInstance as WidgetInspectorComponent;
    const saveButton = () => fixture.debugElement.query(By.directive(IonButton)).componentInstance as IonButton;
    const title = () => fixture.nativeElement.querySelector('input[data-field="title"]') as HTMLInputElement;
    const inputTitle = (value: string) => {
      const input = title();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    return { fixture, context, inspector, saveButton, title, inputTitle };
  }
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))));
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('blocks the real save button and method while retaining invalid title through other changes and failed save', async () => {
    const f = await render();
    expect(f.title()).not.toBeNull();
    f.inputTitle('温'.repeat(22));
    expect(f.fixture.componentInstance.invalid).toBe(true);
    expect(f.saveButton().disabled).toBe(true);
    await f.fixture.componentInstance.save();
    expect(f.context.save).not.toHaveBeenCalled();
    f.inspector().setOption('showDelta', true);
    f.fixture.changeDetectorRef.markForCheck();
    f.fixture.detectChanges();
    expect(f.title().value).toBe('温'.repeat(22));
    expect(f.fixture.componentInstance.invalid).toBe(true);

    const exact = '🙂'.repeat(16);
    f.inputTitle(exact);
    expect(f.fixture.componentInstance.invalid).toBe(false);
    expect(f.saveButton().disabled).toBe(false);
    await f.fixture.componentInstance.save();
    f.fixture.changeDetectorRef.markForCheck();
    f.fixture.detectChanges();
    expect(f.context.save).toHaveBeenCalledOnce();
    expect(f.fixture.componentInstance.widget!.title).toBe(exact);
    expect(f.fixture.componentInstance.widget!.grid).toEqual(f.context.card.widget.grid);
    expect(f.title().value).toBe(exact);
    expect(f.fixture.nativeElement.querySelector('.error').textContent).toContain('保存失败');
  });

  it('discards only the local invalid draft when the cached property page is re-entered', async () => {
    const f = await render();
    f.inputTitle('a'.repeat(65));
    expect(f.fixture.componentInstance.invalid).toBe(true);
    f.fixture.componentInstance.ionViewWillEnter();
    f.fixture.changeDetectorRef.markForCheck();
    f.fixture.detectChanges();
    expect(f.fixture.componentInstance.invalid).toBe(false);
    expect(f.title().value).toBe('已保存标题');
    expect(f.context.save).not.toHaveBeenCalled();
  });

  it('updates the save gate in the same user event when an explicit appearance change drops an unsupported error', async () => {
    const f = await render();
    const decimals = f.fixture.nativeElement.querySelector('[data-option="decimals"] input') as HTMLInputElement;
    decimals.value = '9'; decimals.dispatchEvent(new Event('input', { bubbles: true }));
    f.fixture.changeDetectorRef.markForCheck(); f.fixture.detectChanges();
    expect(f.saveButton().disabled).toBe(true);
    const appearance = f.fixture.nativeElement.querySelector('.appearance-group') as HTMLDetailsElement;
    appearance.open = true;
    const button = [...appearance.querySelectorAll<HTMLButtonElement>('[aria-label="组件外观"] button')]
      .find(item => item.textContent?.trim() === f.inspector().variantLabel('status'))!;
    button.click();
    f.fixture.changeDetectorRef.markForCheck(); f.fixture.detectChanges();
    expect(f.fixture.componentInstance.widget!.variant).toBe('status');
    expect(f.saveButton().disabled).toBe(false);
    expect(f.fixture.componentInstance.invalid).toBe(false);
    expect(f.context.save).not.toHaveBeenCalled();
  });
});
