import { Subject } from 'rxjs';
import { Layouter2Component } from './layouter2';
import { Mode } from './layouter2-mode';

describe('classic editor save lifecycle', () => {
  function harness(saved = true) {
    const save = vi.fn().mockResolvedValue(saved);
    const toast = vi.fn().mockResolvedValue(undefined);
    const editor = new Layouter2Component({ snapshot: { params: {} } } as never, {} as never,
      { saveDeviceConfig: save } as never, {} as never, {} as never, {} as never, {} as never,
      { showToast: toast } as never, { markForCheck: vi.fn() } as never);
    editor.device = { deviceName: 'test', config: { broker: '', mode: 'bbp2', customName: '', layouter: 'original' },
      data: { layouterData: { dashboard: [{ key: 'switch' }] } }, storage: {}, subject: new Subject() };
    editor.unlock(); editor.device.data.layouterData.dashboard.push({ key: 'temperature' });
    return { editor, save, toast };
  }
  it('keeps the edited draft and edit mode when saving fails', async () => {
    const { editor, toast } = harness(false); await editor.lock();
    expect(editor.mode).toBe(Mode.Edit); expect(editor.device.config.layouter).toBe('original');
    expect(editor.device.data.layouterData.dashboard).toHaveLength(2); expect(toast).toHaveBeenCalled();
  });
  it('commits after successful save and blocks duplicate clicks while pending', async () => {
    const { editor, save } = harness(); const saving = editor.lock(); await editor.lock(); await saving;
    expect(save).toHaveBeenCalledOnce(); expect(editor.mode).toBe(Mode.Default);
    expect(JSON.parse(editor.device.config.layouter!).dashboard).toHaveLength(2);
  });
});
