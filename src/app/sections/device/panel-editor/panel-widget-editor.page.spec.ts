import type { ActivatedRoute } from '@angular/router';
import type { NavController } from '@ionic/angular/standalone';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { PanelWidgetEditorContextService, type PanelWidgetEditorContext } from './panel-widget-editor-context.service';
import { PanelWidgetEditorPage } from './panel-widget-editor.page';

describe('Panel widget editor layout and preview boundary', () => {
  let page: PanelWidgetEditorPage;
  let context: PanelWidgetEditorContext;
  let contexts: PanelWidgetEditorContextService;
  let navigateBack: ReturnType<typeof vi.fn>;
  let original: PageLayoutWidget;

  beforeEach(() => {
    original = {
      widgetId: 'saved-widget', endpointKey: 'level', type: 'slider', variant: 'stepper',
      title: '原有标题', extraKeys: ['voltage', 'current'],
      grid: { x: 1, y: 6, width: 3, height: 5 },
      options: { caption: '保留原备注', showTitle: false },
    };
    const card: PanelCard = {
      widget: original,
      field: { id: 7, key: 'level', role: 'property', valueType: 'integer', readable: true, writable: true, notifies: true },
      value: 0, display: '0', draft: '0', error: '', disabled: false,
    };
    context = {
      deviceId: 'device-1', widgetId: original.widgetId, card, theme: 'electronic', extraCandidates: [], error: '',
      preview: vi.fn().mockImplementation(widget => ({ ...card, widget })),
      save: vi.fn().mockResolvedValue(true), remove: vi.fn().mockResolvedValue(true), canLeave: vi.fn().mockResolvedValue(true),
    };
    contexts = new PanelWidgetEditorContextService();
    contexts.set(context);
    navigateBack = vi.fn().mockResolvedValue(true);
    const route = { snapshot: { paramMap: { get: (key: string) => key === 'id' ? context.deviceId : context.widgetId } } };
    page = new PanelWidgetEditorPage(route as unknown as ActivatedRoute, { navigateBack } as unknown as NavController, contexts);
    page.ionViewWillEnter();
  });

  it('opens a deep draft without fitting a saved grid or changing bindings, options or theme', () => {
    expect(page.widget).toEqual(original);
    expect(page.widget).not.toBe(original);
    expect(page.widget!.grid).not.toBe(original.grid);
    expect(page.widget!.extraKeys).not.toBe(original.extraKeys);
    expect(page.theme).toBe('electronic');
    expect(context.save).not.toHaveBeenCalled();
    expect(context.remove).not.toHaveBeenCalled();
  });

  it('reads the existing preview card with the exact draft and does not persist', () => {
    const saved = structuredClone(original);
    expect(page.card?.widget.grid).toEqual({ x: 1, y: 6, width: 3, height: 5 });
    expect(context.preview).toHaveBeenCalledWith(page.widget);
    expect(original).toEqual(saved);
    expect(context.save).not.toHaveBeenCalled();
    expect(context.remove).not.toHaveBeenCalled();
  });

  it('changes only the local title draft while keeping identity, order, binding and grid', () => {
    const draft = { ...page.widget!, title: '草稿标题' };
    page.updateWidget(draft);
    expect(page.widget).toEqual({ ...original, title: '草稿标题' });
    expect(original.title).toBe('原有标题');
    expect(original.extraKeys).toEqual(['voltage', 'current']);
    expect(context.save).not.toHaveBeenCalled();
  });

  it('returns to the parent editor without saving or removing the property draft', async () => {
    page.updateWidget({ ...page.widget!, title: '未保存标题' });
    expect(await page.canDeactivate(`${page.editorUrl}?from=properties`)).toBe(true);
    expect(context.canLeave).not.toHaveBeenCalled();
    expect(context.save).not.toHaveBeenCalled();
    expect(context.remove).not.toHaveBeenCalled();
    expect(original.title).toBe('原有标题');
  });

  it('delegates leaving the whole editor to the original panel owner', async () => {
    vi.mocked(context.canLeave).mockResolvedValue(false);
    expect(await page.canDeactivate('/home')).toBe(false);
    expect(context.canLeave).toHaveBeenCalledTimes(1);
    expect(context.save).not.toHaveBeenCalled();
  });

  it('saves through the original context and returns only after confirmation', async () => {
    page.updateWidget({ ...page.widget!, title: '确认标题' });
    const draft = page.widget;
    await page.save();
    expect(context.save).toHaveBeenCalledWith(draft);
    expect(navigateBack).toHaveBeenCalledWith(page.editorUrl);
    expect(page.error).toBe('');
    expect(page.saving).toBe(false);
    expect(original.title).toBe('原有标题');
  });

  it('keeps exact draft and original dimensions when the owner rejects save', async () => {
    context = { ...context, error: '版本已改变，草稿已保留' };
    contexts.set(context);
    page.ionViewWillEnter();
    vi.mocked(context.save).mockResolvedValue(false);
    page.updateWidget({ ...page.widget!, title: '保留草稿' });
    const draft = structuredClone(page.widget);
    await page.save();
    expect(page.widget).toEqual(draft);
    expect(page.error).toBe(context.error);
    expect(navigateBack).not.toHaveBeenCalled();
    expect(page.saving).toBe(false);
    expect(original.title).toBe('原有标题');
  });

  it('retains the draft after an exception without leaking the error or navigating', async () => {
    vi.mocked(context.save).mockRejectedValue(new Error('private diagnostic'));
    const draft = structuredClone(page.widget);
    await page.save();
    expect(page.widget).toEqual(draft);
    expect(page.error).toBe('保存失败，请重试。');
    expect(navigateBack).not.toHaveBeenCalled();
    expect(page.saving).toBe(false);
  });

  it('blocks draft updates, repeated submissions and exit while the owner is saving', async () => {
    let confirm!: (saved: boolean) => void;
    vi.mocked(context.save).mockReturnValue(new Promise<boolean>(resolve => { confirm = resolve; }));
    const draft = page.widget;
    const pending = page.save();
    expect(page.saving).toBe(true);
    page.updateWidget({ ...draft!, title: '不得替换提交中的草稿' });
    await page.save();
    await page.remove();
    expect(await page.canDeactivate(page.editorUrl)).toBe(false);
    expect(page.widget).toBe(draft);
    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.remove).not.toHaveBeenCalled();
    expect(navigateBack).not.toHaveBeenCalled();
    confirm(true);
    await pending;
    expect(navigateBack).toHaveBeenCalledWith(page.editorUrl);
  });

  it('removes only through the existing context, without resaving the draft', async () => {
    await page.remove();
    expect(context.remove).toHaveBeenCalledTimes(1);
    expect(context.save).not.toHaveBeenCalled();
    expect(navigateBack).toHaveBeenCalledWith(page.editorUrl);
  });

  it('does not reuse a different widget context or create a replacement layout', () => {
    contexts.set({ ...context, widgetId: 'another-widget' });
    page.ionViewWillEnter();
    expect(page.context).toBeUndefined();
    expect(page.widget).toBeUndefined();
    expect(navigateBack).toHaveBeenCalledWith(page.editorUrl, { replaceUrl: true });
    expect(context.save).not.toHaveBeenCalled();
  });

  it('blocks saving the previous valid widget while any raw property input is invalid', async () => {
    const draft = structuredClone(page.widget);
    page.setInvalid(true);
    await page.save();
    expect(context.save).not.toHaveBeenCalled();
    expect(navigateBack).not.toHaveBeenCalled();
    expect(page.widget).toEqual(draft);
    page.setInvalid(false);
    await page.save();
    expect(context.save).toHaveBeenCalledExactlyOnceWith(draft);
  });

  it('keeps invalid through other valid changes until the inspector explicitly clears it', () => {
    page.setInvalid(true);
    page.updateWidget({ ...page.widget!, title: '另一个有效修改' });
    expect(page.invalid).toBe(true);
    expect(page.widget!.title).toBe('另一个有效修改');
  });

  it('resets invalid and gives the cached inspector a fresh draft session when re-entering', () => {
    const version = page.draftVersion;
    page.setInvalid(true);
    page.updateWidget({ ...page.widget!, title: '丢弃的草稿' });
    page.ionViewWillEnter();
    expect(page.invalid).toBe(false);
    expect(page.draftVersion).toBe(version + 1);
    expect(page.widget).toEqual(original);
  });

  it('does not let invalid presentation input prevent removing the whole widget via its owner', async () => {
    page.setInvalid(true);
    await page.remove();
    expect(context.remove).toHaveBeenCalledOnce();
    expect(context.save).not.toHaveBeenCalled();
    expect(navigateBack).toHaveBeenCalledWith(page.editorUrl);
  });
});
