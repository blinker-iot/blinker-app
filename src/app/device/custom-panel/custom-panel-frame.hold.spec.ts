import { TestBed } from '@angular/core/testing';
import { CustomPanelFrameComponent } from './custom-panel-frame.component';
import type { DeviceUiEndpoint } from '../../core/device-v2/device-ui.port';
import type { PanelCard } from '../v2/widgets/widget-kit';

type HoldCard = PanelCard & { controlScope?: string; controlAvailable?: boolean };
type Target = { field: DeviceUiEndpoint; widgetId: string; scope?: string };
type Hold = { id: string; phase: 'press' | 'release'; target: Target };

describe('QA5 custom frame paired Hold release', () => {
  const card = (): HoldCard => ({
    widget: { widgetId: 'hold-a', endpointKey: 'power-a', type: 'switch', variant: 'hold',
      grid: { x: 0, y: 0, width: 2, height: 2 } },
    field: { id: 1, key: 'power-a', role: 'property', valueType: 'boolean', readable: true,
      writable: true, notifies: true },
    value: false, display: 'false', draft: '', error: '', disabled: false,
    controlScope: 'device-a:3:manifest-a', controlAvailable: true,
  });
  const hold = (model: HoldCard, phase: Hold['phase'] = 'press', id = 'hold-1'): Hold => ({
    id, phase, target: { field: { ...model.field }, widgetId: model.widget.widgetId, scope: model.controlScope },
  });

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ script: '', styles: '' }) })));
    await TestBed.configureTestingModule({ imports: [CustomPanelFrameComponent] }).compileComponents();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  async function create() {
    const fixture = TestBed.createComponent(CustomPanelFrameComponent), model = card(), action = vi.fn();
    fixture.componentRef.setInput('document', { version: 1, theme: 'natural', html: '<p>Hold test</p>' });
    fixture.componentRef.setInput('cards', [model]); fixture.componentRef.setInput('active', true);
    fixture.componentRef.setInput('interactive', true); fixture.componentInstance.action.subscribe(action);
    fixture.detectChanges();
    const frame = async () => {
      await vi.waitFor(() => { fixture.detectChanges(); expect(fixture.nativeElement.querySelector('iframe')).not.toBeNull(); });
      const element = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
      const encoded = element.srcdoc.match(/window\.__BLINKER_CHANNEL__=("[^"]+");/)?.[1];
      expect(encoded).toBeTruthy();
      return { element, source: element.contentWindow!, channel: JSON.parse(encoded!) as string };
    };
    let owner = await frame();
    const message = (data: object, overrides: Partial<MessageEventInit> = {}) => {
      window.dispatchEvent(new MessageEvent('message', { source: owner.source, origin: 'null',
        data: { channel: owner.channel, ...data }, ...overrides }));
    };
    owner.element.dispatchEvent(new Event('load')); message({ type: 'ready' });
    return { fixture, model, action, message,
      send(input: Hold, value = input.phase === 'press') {
        message({ type: 'action', key: input.target.field.key, kind: 'toggle', value, hold: input });
      },
      update(next: HoldCard) { fixture.componentRef.setInput('cards', [next]); fixture.detectChanges(); },
      flag(name: 'active' | 'interactive', value: boolean) { fixture.componentRef.setInput(name, value); fixture.detectChanges(); },
      async document() {
        const previous = owner;
        fixture.componentRef.setInput('document', { version: 1, theme: 'natural', html: '<p>New owner</p>' });
        fixture.detectChanges(); owner = await frame();
        expect(owner.channel).not.toBe(previous.channel);
        owner.element.dispatchEvent(new Event('load')); message({ type: 'ready' });
        return previous;
      },
    };
  }

  it('forwards one original-target release through busy, but never a duplicate release', async () => {
    const t = await create(), press = hold(t.model);
    t.send(press); expect(t.action).toHaveBeenCalledTimes(1);
    t.update({ ...t.model, disabled: true }); t.send({ ...press, phase: 'release' });
    expect(t.action).toHaveBeenCalledTimes(2);
    expect(t.action.mock.lastCall?.[0]).toMatchObject({ kind: 'toggle', value: false,
      field: t.model.field, widgetId: 'hold-a', hold: { id: press.id, phase: 'release', target: { scope: t.model.controlScope } } });
    t.send({ ...press, phase: 'release' }); expect(t.action).toHaveBeenCalledTimes(2);
  });

  it('does not grant an unpaired release an ordinary false-write fallback', async () => {
    const t = await create(); t.send(hold(t.model, 'release'));
    expect(t.action).not.toHaveBeenCalled();
  });

  it('does not replace an accepted pair on a duplicate press', async () => {
    const t = await create(), press = hold(t.model);
    t.send(press); t.send(press); expect(t.action).toHaveBeenCalledTimes(1);
    t.send({ ...press, phase: 'release' }); expect(t.action).toHaveBeenCalledTimes(2);
  });

  it.each(['widget', 'field-id', 'field-key', 'role', 'type', 'scope'] as const)(
    'rejects a forged %s target before recording a press', async change => {
      const t = await create(), input = hold(t.model), target = input.target;
      if (change === 'widget') target.widgetId = 'another-widget';
      else if (change === 'field-id') target.field.id = 2;
      else if (change === 'field-key') target.field.key = 'another-field';
      else if (change === 'role') target.field.role = 'action';
      else if (change === 'type') target.field.valueType = 'integer';
      else target.scope = 'another-device:3:manifest-a';
      t.message({ type: 'action', key: t.model.field.key, kind: 'toggle', value: true, hold: input });
      expect(t.action).not.toHaveBeenCalled();
    });

  it('uses authoritative metadata rather than extra attributes supplied by the frame', async () => {
    const t = await create(), press = hold(t.model);
    press.target.field = { ...press.target.field, writable: false, minimum: -999, unit: 'untrusted' };
    t.send(press); expect(t.action).toHaveBeenCalledTimes(1);
    expect(t.action.mock.lastCall?.[0].field).toEqual(t.model.field);
    t.update({ ...t.model, disabled: true }); t.send({ ...press, phase: 'release' });
    expect(t.action).toHaveBeenCalledTimes(2);
    expect(t.action.mock.lastCall?.[0].field).toEqual(t.model.field);
  });

  it.each(['active', 'interactive'] as const)('retires a pair when %s closes, without replay on return', async flag => {
    const t = await create(), press = hold(t.model); t.send(press);
    t.flag(flag, false); t.send({ ...press, phase: 'release' });
    t.flag(flag, true); t.send({ ...press, phase: 'release' });
    expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('retires the old pair on a scope change even if the old scope later returns', async () => {
    const t = await create(), press = hold(t.model); t.send(press);
    t.update({ ...t.model, controlScope: 'device-b:4:manifest-b' }); t.update({ ...t.model });
    t.send({ ...press, phase: 'release' }); expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('does not release an unavailable owner or revive it after availability returns', async () => {
    const t = await create(), press = hold(t.model); t.send(press);
    t.update({ ...t.model, disabled: true, controlAvailable: false }); t.send({ ...press, phase: 'release' });
    t.update({ ...t.model }); t.send({ ...press, phase: 'release' });
    expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('limits live pairs to 32 and never treats an overflow press as accepted', async () => {
    const t = await create();
    for (let index = 0; index < 33; index++) t.send(hold(t.model, 'press', `hold-${index}`));
    expect(t.action).toHaveBeenCalledTimes(32);
    t.send(hold(t.model, 'release', 'hold-32')); expect(t.action).toHaveBeenCalledTimes(32);
  });

  it('keeps the existing source, origin and channel message boundaries', async () => {
    const t = await create(), press = hold(t.model), data = { type: 'action', key: 'power-a', kind: 'toggle', value: true, hold: press };
    t.message(data, { source: window }); t.message(data, { origin: 'https://untrusted.invalid' });
    t.message({ ...data, channel: 'old-channel' }); expect(t.action).not.toHaveBeenCalled();
    t.send(press); expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('retires accepted pairs when the document creates a fresh channel', async () => {
    const t = await create(), press = hold(t.model); t.send(press); const old = await t.document();
    t.message({ type: 'action', key: 'power-a', kind: 'toggle', value: false, hold: { ...press, phase: 'release' } },
      { source: old.source, data: { channel: old.channel, type: 'action', key: 'power-a', kind: 'toggle', value: false,
        hold: { ...press, phase: 'release' } } });
    t.send({ ...press, phase: 'release' }); expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('preserves ordinary toggle behavior and does not allow ordinary writes through busy', async () => {
    const t = await create(); t.message({ type: 'action', key: 'power-a', kind: 'toggle', value: false });
    expect(t.action).toHaveBeenCalledTimes(1);
    t.update({ ...t.model, disabled: true }); t.message({ type: 'action', key: 'power-a', kind: 'toggle', value: false });
    expect(t.action).toHaveBeenCalledTimes(1);
  });
});
