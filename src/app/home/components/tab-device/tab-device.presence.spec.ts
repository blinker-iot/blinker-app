import { BehaviorSubject, Subject } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabDeviceComponent } from './tab-device';

describe('home BLE presence lifetime', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());
  const turn = async () => { for (let i = 0; i < 16; ++i) await Promise.resolve(); };
  const harness = () => {
    const data = { auth: { uuid: 'owner-a' } as { uuid: string } | null, sessionEpoch: 1,
      device: { list: ['device-a'] }, deviceDataLoader: new BehaviorSubject(true),
      userDataLoader: new BehaviorSubject(true), authDataChanged: new Subject<void>() };
    const events = new Subject<unknown>(), active = new BehaviorSubject(true), adapter = new BehaviorSubject<boolean | null>(true);
    const callbacks = new Set<() => void>();
    const refresh = vi.fn(async (_ids: readonly string[], _signal: AbortSignal) => undefined);
    const watchAdapter = vi.fn(() => adapter);
    const editing = signal(false), editorActive = signal(false), saving = signal(false), dragging = signal(false);
    const generation = signal(0);
    const editor = {
      editing, active: editorActive, saving, dragging, generation,
      error: signal(''), selectedId: signal<string | undefined>(undefined),
      settingsId: signal<string | null>(null), closeSettings: vi.fn(),
      refresh: vi.fn(), setActive: vi.fn((value: boolean) => editorActive.set(value)),
      cancel: vi.fn(() => { editing.set(false); generation.update(value => value + 1); }),
      save: vi.fn(() => true), dirty: vi.fn(() => false),
    };
    let dismissRole = 'cancel';
    const alert = { present: vi.fn(async () => undefined), onDidDismiss: vi.fn(async () => ({ role: dismissRole })),
      dismiss: vi.fn(async () => true), remove: vi.fn() };
    const alerts = { create: vi.fn(async () => alert) };
    let backHandler!: (processNext: () => void) => void;
    const backSubscription = { unsubscribe: vi.fn() };
    const platform = { backButton: { subscribeWithPriority: vi.fn((priority: number,
      callback: (processNext: () => void) => void) => {
        expect(priority).toBe(10000); backHandler = callback; return backSubscription;
      }) } };
    const component = new TabDeviceComponent(data as any, { url: '/home/device', events } as any,
      {} as any, { refreshBlePresence: refresh, watchBleAdapterEnabled: watchAdapter } as any,
      { markForCheck: vi.fn() } as any,
      { onDestroy: (cb: () => void) => { callbacks.add(cb); return () => callbacks.delete(cb); } } as any,
      { active } as any, editor as any, alerts as any, platform as any);
    component.ngOnInit();
    return { data, events, active, adapter, refresh, watchAdapter, component, editor, alert, alerts, backSubscription,
      setDismissRole: (role: string) => { dismissRole = role; }, back: (next: () => void) => backHandler(next),
      destroy: () => { for (const cb of [...callbacks]) cb(); } };
  };

  it('background, route leave and logout cancel demand; foreground re-evaluates the actual route', async () => {
    const h = harness(); await turn(); expect(h.refresh).toHaveBeenCalledOnce();
    expect(h.watchAdapter).toHaveBeenCalledOnce();
    h.active.next(false); await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledOnce();
    h.active.next(true); await turn(); expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.watchAdapter).toHaveBeenCalledTimes(2);
    h.events.next(new NavigationEnd(1, '/scene', '/scene'));
    h.active.next(false); h.active.next(true); await vi.advanceTimersByTimeAsync(30_000);
    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.watchAdapter).toHaveBeenCalledTimes(2);
    h.events.next(new NavigationEnd(2, '/home/device', '/home/device')); await turn();
    expect(h.refresh).toHaveBeenCalledTimes(3);
    h.data.auth = null; h.data.sessionEpoch++; h.data.authDataChanged.next();
    await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledTimes(3); h.destroy();
  });

  it('radio loss cancels its signal; repeated loads do not add scanner owners', async () => {
    const h = harness(); await turn(); const signal = h.refresh.mock.calls[0][1];
    h.data.deviceDataLoader.next(true); h.data.deviceDataLoader.next(true); await turn();
    expect(h.refresh).toHaveBeenCalledOnce();
    h.adapter.next(false); expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledOnce();
    h.adapter.next(true); await turn(); expect(h.refresh).toHaveBeenCalledTimes(2);
    h.destroy(); await vi.advanceTimersByTimeAsync(30_000); expect(h.refresh).toHaveBeenCalledTimes(2);
  });

  it('pauses editing while backgrounded, but discards it after an actual route leave', () => {
    const h = harness(); h.editor.editing.set(true);
    h.active.next(false);
    expect(h.editor.active()).toBe(false);
    expect(h.editor.editing()).toBe(true);
    expect(h.editor.cancel).not.toHaveBeenCalled();
    h.active.next(true); expect(h.editor.active()).toBe(true);
    h.events.next(new NavigationEnd(1, '/home/tools', '/home/tools'));
    expect(h.editor.editing()).toBe(false);
    expect(h.editor.active()).toBe(false);
    h.destroy();
  });

  it('does not change the selected room through either input or output while editing', () => {
    const h = harness(); h.component.roomid = 1;
    h.editor.editing.set(true);
    h.component.roomid = 2; h.component.onRoomidChange(2);
    expect(h.component.roomid).toBe(1);
    h.editor.editing.set(false); h.component.onRoomidChange(2);
    expect(h.component.roomid).toBe(2);
    h.destroy();
  });

  it('keeps a dirty draft until discard is confirmed and blocks exit while saving', async () => {
    const h = harness(); h.editor.editing.set(true); h.editor.dirty.mockReturnValue(true);
    expect(await h.component.canDeactivate()).toBe(false);
    expect(h.editor.editing()).toBe(true);
    expect(h.editor.cancel).not.toHaveBeenCalled();
    h.editor.saving.set(true); expect(await h.component.canDeactivate()).toBe(false);
    expect(h.alerts.create).toHaveBeenCalledOnce();
    h.editor.saving.set(false); h.setDismissRole('destructive');
    expect(await h.component.canDeactivate()).toBe(true);
    expect(h.editor.editing()).toBe(false);
    h.destroy();
  });

  it('only consumes the hardware back button for the visible active editor', async () => {
    const h = harness(), next = vi.fn();
    h.back(next); expect(next).toHaveBeenCalledOnce();
    h.editor.editing.set(true); h.back(next); await turn();
    expect(next).toHaveBeenCalledOnce(); expect(h.editor.editing()).toBe(false);
    h.destroy(); expect(h.backSubscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not let a late discard confirmation cancel a successor draft', async () => {
    const h = harness(); h.editor.editing.set(true); h.editor.dirty.mockReturnValue(true);
    let dismiss!: (value: { role: string }) => void;
    h.alert.onDidDismiss.mockImplementationOnce(() => new Promise(resolve => { dismiss = resolve; }));
    const decision = h.component.canDeactivate(); await turn();
    h.editor.cancel(); h.editor.editing.set(true); h.editor.generation.update(value => value + 1);
    h.editor.cancel.mockClear(); dismiss({ role: 'destructive' });
    expect(await decision).toBe(false);
    expect(h.editor.editing()).toBe(true);
    expect(h.editor.cancel).not.toHaveBeenCalled();
    h.destroy();
  });
});
