import type { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import { gridsOverlap } from '../../../core/device-v2/panel-document';
import type { PageLayout } from '../../../core/device-v2/page-layout';
import type { BlinkerDevice } from '../../../core/model/device.model';
import { DeviceComponentsPage } from './device-components.page';

describe('UI4 existing component settings persistence boundary', () => {
  function setup() {
    const layout: PageLayout = { schemaVersion: 1, columns: 8, revision: 7,
      manifestFingerprint: 'ab'.repeat(32), style: 'dark', widgets: [
        { widgetId: 'second', type: 'value', variant: 'number', endpointKey: 'voltage', title: '电压',
          grid: { x: 4, y: 4, width: 2, height: 2 }, options: { decimals: 0, showDelta: false } },
        { widgetId: 'first', type: 'value', variant: 'number', endpointKey: 'temperature', title: '温度',
          grid: { x: 2, y: 4, width: 2, height: 2 }, options: { scale: 0.1 } },
      ] };
    const data = { auth: { uuid: 'test-account' }, sessionEpoch: 1 };
    const saveCandidate = vi.fn().mockImplementation(async (_id, candidate) => ({ layout: candidate, revision: 8 }));
    const page = new DeviceComponentsPage(
      { snapshot: { paramMap: { get: () => 'test-device' } } } as unknown as ActivatedRoute,
      data as never, {} as never, { saveCandidate } as never, {} as never,
      { markForCheck: vi.fn() } as never, {} as never,
    );
    page.device = { config: { mode: 'bbp2' }, subject: new Subject() } as BlinkerDevice;
    page.layout = layout;
    page.snapshot = { manifestAccepted: true, endpoints: [] } as unknown as DeviceUiSnapshot;
    page.editing = { widget: structuredClone(layout.widgets[1]), layout, revision: 7 };
    return { page, layout, saveCandidate };
  }

  it('rejects invalid raw input before any save of the previous valid widget', async () => {
    const { page, saveCandidate } = setup();
    const editing = page.editing;
    page.setStyleInvalid(true);
    await page.saveStyle();
    expect(saveCandidate).not.toHaveBeenCalled();
    expect(page.editing).toBe(editing);
    expect(page.saving).toBe(false);
    page.setStyleInvalid(false);
    await page.saveStyle();
    expect(saveCandidate).toHaveBeenCalledOnce();
  });

  it('saves a title change without repacking saved positions, order, options or bindings', async () => {
    const { page, layout, saveCandidate } = setup();
    const original = structuredClone(layout);
    page.updateStyleWidget({ ...page.editing!.widget, title: '新的设备标题' });
    await page.saveStyle();
    expect(saveCandidate).toHaveBeenCalledWith('test-device', {
      ...original, widgets: [original.widgets[0], { ...original.widgets[1], title: '新的设备标题' }],
    }, [], 7);
    expect(layout).toEqual(original);
    expect(page.editing).toBeUndefined();
  });

  it('places only an explicitly enlarged widget and leaves every other item unchanged', async () => {
    const { page, layout, saveCandidate } = setup();
    const original = structuredClone(layout);
    page.updateStyleWidget({ ...page.editing!.widget,
      grid: { ...page.editing!.widget.grid, width: 4 } });
    await page.saveStyle();
    const candidate: PageLayout = saveCandidate.mock.calls[0][1];
    expect(candidate.widgets.map(item => item.widgetId)).toEqual(['second', 'first']);
    expect(candidate.widgets[0]).toEqual(original.widgets[0]);
    expect(candidate.widgets[1].endpointKey).toBe(original.widgets[1].endpointKey);
    expect(candidate.widgets[1].grid.width).toBe(4);
    expect(gridsOverlap(candidate.widgets[0].grid, candidate.widgets[1].grid)).toBe(false);
    expect(layout).toEqual(original);
  });

  it('keeps the property draft and stored layout after failure, then clears the error on retry', async () => {
    const { page, layout, saveCandidate } = setup();
    page.updateStyleWidget({ ...page.editing!.widget, title: '失败仍保留' });
    const draft = structuredClone(page.editing);
    saveCandidate.mockRejectedValueOnce(new Error('private failure'));
    await page.saveStyle();
    expect(page.editing).toEqual(draft);
    expect(page.layout).toBe(layout);
    expect(page.error).toBe('样式保存失败，请重试。');
    await page.saveStyle();
    expect(page.error).toBe('');
    expect(page.editing).toBeUndefined();
  });

  it('blocks repeated saves and property changes while the original save is pending', async () => {
    const { page, saveCandidate } = setup();
    let finish!: (value: unknown) => void;
    saveCandidate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const draft = page.editing!.widget;
    const pending = page.saveStyle();
    page.updateStyleWidget({ ...draft, title: '不能替换提交中的草稿' });
    page.setStyleInvalid(true);
    await page.saveStyle();
    expect(page.editing!.widget).toBe(draft);
    expect(page.editing!.invalid).toBeUndefined();
    expect(saveCandidate).toHaveBeenCalledOnce();
    finish({ layout: page.editing!.layout, revision: 8 });
    await pending;
    expect(page.saving).toBe(false);
  });
});
