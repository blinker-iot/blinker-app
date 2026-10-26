import { Subject } from 'rxjs';
import type { Mock } from 'vitest';
import type { DeviceUiEndpoint } from '../../../core/device-v2/device-ui.port';
import type { LegacyBinding } from '../../../core/device-v2/legacy-panel';
import type { PanelDocument } from '../../../core/device-v2/panel-document';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { DeviceV2PageLayoutRecord } from '../../../core/services/device-v2-page-layout.service';
import { PanelEditorPage } from './panel-editor.page';

// A typed view only: every method below still runs on the real PanelEditorPage.
// Persistence is the unit boundary; the production change/commit/rollback chain is not stubbed.
interface PropertyOwner {
  bindings: Record<string, LegacyBinding>;
  previous: { document: PanelDocument; bindings: Record<string, LegacyBinding> }[];
  savedState: string;
  record?: DeviceV2PageLayoutRecord | null;
  saveWidgetChange(change: () => void): Promise<boolean>;
  removeWidget(widgetId: string): void;
  rebuildItems(): void;
  refreshCards(): void;
}

describe('UI4 property edits retain the existing whole-panel save owner', () => {
  let page: PanelEditorPage;
  let owner: PropertyOwner;
  let save: Mock<PanelEditorPage['save']>;
  let rebuild: Mock<PropertyOwner['rebuildItems']>;
  let refresh: Mock<PropertyOwner['refreshCards']>;

  beforeEach(() => {
    const route = { snapshot: { paramMap: { get: () => 'test-device' } } };
    page = new PanelEditorPage(route as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never);
    owner = page as unknown as PropertyOwner;
    const endpoints: DeviceUiEndpoint[] = [
      { id: 1, key: 'power', role: 'property', valueType: 'boolean',
        readable: true, writable: true, notifies: true },
      { id: 2, key: 'temperature', role: 'property', valueType: 'number',
        readable: true, writable: false, notifies: true },
    ];
    page.device = { deviceName: 'test-device', config: { mode: 'bbp2' },
      data: {}, storage: {}, subject: new Subject() } as BlinkerDevice;
    page.snapshot = { manifestAccepted: true, manifestFingerprint: 'ab'.repeat(32),
      manifestRevision: 1, stateRevision: 3, stateFresh: true, endpoints };
    page.document = {
      schemaVersion: 1, columns: 8, style: 'electronic', widgets: [
        // The parent's unrelated draft is intentionally first but visually lower.
        { widgetId: 'parent-draft', type: 'value', variant: 'number', endpointKey: 'temperature',
          title: '父页其他未保存标题', options: { showTitle: false, decimals: 0 },
          grid: { x: 4, y: 8, width: 2, height: 2 } },
        { widgetId: 'edited-power', type: 'switch', endpointKey: 'power', title: '原电源',
          grid: { x: 0, y: 0, width: 4, height: 2 } },
      ],
    };
    owner.bindings = { 'edited-power': { field: endpoints[0], source: { mode: 2, cus: 'power' } } };
    owner.previous = [{ document: structuredClone(page.document), bindings: structuredClone(owner.bindings) }];
    page.dirty = true;
    owner.savedState = 'earlier-whole-panel-snapshot';
    owner.record = { logicalDeviceId: 'test-device', revision: 7,
      manifestFingerprint: 'ab'.repeat(32), createdAt: 1, updatedAt: 2,
      layout: { ...structuredClone(page.document), revision: 7, manifestFingerprint: 'ab'.repeat(32) } };
    rebuild = vi.spyOn(owner, 'rebuildItems').mockImplementation(() => {});
    refresh = vi.spyOn(owner, 'refreshCards').mockImplementation(() => {});
    save = vi.spyOn(page, 'save');
  });

  it('submits the whole current panel with its other draft via save(false), without a second property store', async () => {
    const parentDraft = structuredClone(page.document!.widgets[0]);
    save.mockImplementation(async returnToDevice => {
      expect(returnToDevice).toBe(false);
      expect(page.document!.style).toBe('electronic');
      expect(page.document!.widgets[0]).toEqual(parentDraft);
      expect(page.document!.widgets.map(widget => widget.widgetId)).toEqual(['parent-draft', 'edited-power']);
      expect(page.document!.widgets[1].title).toBe('新电源标题');
      page.dirty = false;
      owner.savedState = 'confirmed-whole-panel-snapshot';
      return true;
    });

    const result = await owner.saveWidgetChange(() => page.updateWidget({
      ...page.document!.widgets[1], title: '新电源标题',
    }));

    expect(result).toBe(true);
    expect(save).toHaveBeenCalledExactlyOnceWith(false);
    expect(page.document!.widgets[0]).toEqual(parentDraft);
    expect(page.document!.widgets[1].title).toBe('新电源标题');
    expect(page.dirty).toBe(false);
    expect(owner.savedState).toBe('confirmed-whole-panel-snapshot');
    expect(owner.previous).toHaveLength(2);
    expect(rebuild).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('restores client document, bindings, undo, dirty and savedState on failure but keeps a new server revision', async () => {
    const document = page.document;
    const bindings = owner.bindings;
    const previous = structuredClone(owner.previous);
    const savedState = owner.savedState;
    const serverRecord = { ...owner.record!, revision: 8, updatedAt: 3 };
    save.mockImplementation(async () => {
      owner.record = serverRecord;
      page.dirty = false;
      owner.savedState = 'must-not-replace-client-baseline';
      page.error = '布局已保存，但面板切换失败。';
      return false;
    });

    const result = await owner.saveWidgetChange(() => {
      page.updateWidget({ ...page.document!.widgets[1], title: '尚未确认的属性' });
      owner.bindings = { ...bindings, temporary: bindings['edited-power'] };
    });

    expect(result).toBe(false);
    expect(save).toHaveBeenCalledExactlyOnceWith(false);
    expect(page.document).toBe(document);
    expect(owner.bindings).toBe(bindings);
    expect(owner.previous).toEqual(previous);
    expect(page.dirty).toBe(true);
    expect(owner.savedState).toBe(savedState);
    expect(owner.record).toBe(serverRecord);
    expect(owner.record!.revision).toBe(8);
    expect(page.error).toBe('布局已保存，但面板切换失败。');
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('executes the same rollback if the persistence boundary throws, leaving error handling to the property page', async () => {
    const document = page.document;
    const bindings = owner.bindings;
    const previous = structuredClone(owner.previous);
    save.mockRejectedValue(new Error('isolated-save-failure'));

    await expect(owner.saveWidgetChange(() => page.updateWidget({
      ...page.document!.widgets[1], title: '失败草稿',
    }))).rejects.toThrow('isolated-save-failure');

    expect(page.document).toBe(document);
    expect(owner.bindings).toBe(bindings);
    expect(owner.previous).toEqual(previous);
    expect(page.dirty).toBe(true);
    expect(owner.savedState).toBe('earlier-whole-panel-snapshot');
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not call persistence when real commit validation rejects the property candidate', async () => {
    const document = page.document;
    const previous = structuredClone(owner.previous);

    const result = await owner.saveWidgetChange(() => page.updateWidget({
      ...page.document!.widgets[1], title: '温'.repeat(22),
    }));

    expect(result).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(page.document).toBe(document);
    expect(owner.previous).toEqual(previous);
    expect(page.dirty).toBe(true);
    expect(page.error).toContain('属性内容或尺寸无效');
    expect(rebuild).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('rolls back a failed whole-panel removal without discarding the parent other draft', async () => {
    const document = page.document;
    const bindings = owner.bindings;
    const previous = structuredClone(owner.previous);
    save.mockImplementation(async returnToDevice => {
      expect(returnToDevice).toBe(false);
      expect(page.document!.widgets).toHaveLength(1);
      expect(page.document!.widgets[0].widgetId).toBe('parent-draft');
      expect(page.document!.widgets[0].title).toBe('父页其他未保存标题');
      return false;
    });

    expect(await owner.saveWidgetChange(() => owner.removeWidget('edited-power'))).toBe(false);
    expect(save).toHaveBeenCalledExactlyOnceWith(false);
    expect(page.document).toBe(document);
    expect(owner.bindings).toBe(bindings);
    expect(owner.previous).toEqual(previous);
    expect(page.document!.widgets.map(widget => widget.widgetId)).toEqual(['parent-draft', 'edited-power']);
    expect(page.dirty).toBe(true);
    expect(owner.savedState).toBe('earlier-whole-panel-snapshot');
  });
});
