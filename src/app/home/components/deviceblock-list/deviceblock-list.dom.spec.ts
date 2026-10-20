import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { DataService } from '../../../core/services/data.service';
import { DeviceUiPort } from '../../../core/device-v2/device-ui.port';
import { DeviceCardEditor } from '../../device-card-editor.service';
import { DeviceCardControl } from '../../device-card-control.service';
import { HomeCardControlIntent } from '../../device-card-control.models';
import { By } from '@angular/platform-browser';
import { Deviceblock } from '../deviceblock/deviceblock';
import { DeviceblockListComponent } from './deviceblock-list';

const sortable = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('sortablejs', () => ({ default: class {
  readonly option = vi.fn(); readonly destroy = vi.fn();
  constructor(readonly element: HTMLElement, readonly options: any) { sortable.instances.push(this); }
  toArray() { return [...this.element.querySelectorAll<HTMLElement>('.deviceblock')].map(item => item.dataset['id']); }
} }));

@Component({ selector: 'deviceblock', template: '<article class="device-card">{{ device.deviceName }}</article>' })
class CardStub {
  @Input() device: any; @Input() wide = false; @Input() editing = false; @Input() bindings: any;
  @Input() controlsEnabled = false; @Input() controlStates: any;
  @Output() configure = new EventEmitter<string | undefined>();
  @Output() capacityChange = new EventEmitter<number>();
  @Output() rangeCapacityChange = new EventEmitter<boolean>();
  @Output() control = new EventEmitter<HomeCardControlIntent>();
  @Output() interactionChange = new EventEmitter<boolean>();
}

describe('device list edit interactions (production list template and editor; Sortable/card doubles)', () => {
  let fixture: ComponentFixture<DeviceblockListComponent>;
  let editor: DeviceCardEditor;
  let data: any;
  let active: BehaviorSubject<boolean>;
  let events: Subject<unknown>;
  let navigate: ReturnType<typeof vi.fn>;
  let writes: ReturnType<typeof vi.fn>;
  let online: Set<string>;
  let send: ReturnType<typeof vi.fn>;
  const ids = () => [...fixture.nativeElement.querySelectorAll('.device-card-item')].map((item: HTMLElement) => item.dataset['id']);
  const first = () => fixture.nativeElement.querySelector('.device-card-item') as HTMLElement;
  function pointer(element: HTMLElement, type: string, x = 10, y = 10) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: y },
      isPrimary: { value: true }, button: { value: 0 } });
    element.dispatchEvent(event);
  }

  beforeEach(async () => {
    const values = new Map<string, string>();
    writes = vi.fn((key: string, value: string) => { values.set(key, value); });
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: writes });
    sortable.instances.length = 0;
    const device = (id: string) => ({ deviceName: id, config: { card: { layout: 'standard' } } });
    data = { auth: { uuid: 'owner' }, sessionEpoch: 1, device: { list: ['a', 'b'], dict: { a: device('a'), b: device('b') } },
      room: { list: [], dict: {} }, authDataChanged: new Subject<void>(), userDataLoader: new BehaviorSubject(true),
      deviceDataLoader: new BehaviorSubject(true) };
    active = new BehaviorSubject(true); events = new Subject(); navigate = vi.fn(async () => true); online = new Set();
    send = vi.fn(async () => undefined);
    TestBed.overrideComponent(DeviceblockListComponent, { remove: { imports: [Deviceblock] }, add: { imports: [CardStub] } });
    await TestBed.configureTestingModule({ imports: [DeviceblockListComponent], providers: [DeviceCardEditor,
      { provide: DataService, useValue: data }, { provide: Router, useValue: { url: '/home/device', events, navigate } },
      { provide: DeviceUiPort, useValue: { appActive: active, isOnline: (id: string) => online.has(id),
        refreshCardStates: vi.fn(async () => undefined) } },
      { provide: DeviceCardControl, useValue: { states: () => ({}), control: send } },
    ] }).compileComponents();
    editor = TestBed.inject(DeviceCardEditor);
    fixture = TestBed.createComponent(DeviceblockListComponent); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('reserves long press for editing and never navigates or saves on the trailing click', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(first(), 'pointerdown'); await vi.advanceTimersByTimeAsync(450); fixture.detectChanges();
    pointer(first(), 'pointerup'); first().click();
    expect(editor.editing()).toBe(true); expect(editor.selectedId()).toBe('a');
    expect(editor.settingsId()).toBeNull();
    expect(fixture.nativeElement.querySelector('.device-drag-handle')).toBeNull();
    expect(first().classList.contains('sortable-card')).toBe(true);
    expect(first().getAttribute('aria-keyshortcuts')).toBe('Enter ArrowUp ArrowDown');
    expect(sortable.instances[0].option).toHaveBeenLastCalledWith('disabled', false);
    expect(navigate).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
    editor.cancel(); fixture.detectChanges(); first().click();
    expect(navigate).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });

  it('cancels a hold on movement, pointer cancellation and account changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(first(), 'pointerdown'); pointer(first(), 'pointermove', 20, 10);
    await vi.advanceTimersByTimeAsync(450); expect(editor.editing()).toBe(false);
    pointer(first(), 'pointerdown'); pointer(first(), 'pointercancel');
    await vi.advanceTimersByTimeAsync(450); expect(editor.editing()).toBe(false);
    pointer(first(), 'pointerdown'); data.auth = { uuid: 'other' }; data.sessionEpoch++; data.authDataChanged.next();
    await vi.advanceTimersByTimeAsync(450); expect(editor.editing()).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });

  it('opens the shared settings from an edit click and locks drag while the panel is open', () => {
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    first().click(); fixture.detectChanges();
    expect(editor.settingsId()).toBe('a');
    expect(sortable.instances[0].option).toHaveBeenLastCalledWith('disabled', true);
    expect(editor.save()).toBe(false); expect(navigate).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
    editor.closeSettings(); fixture.detectChanges();
    fixture.componentInstance.configureCard('a', 'power');
    expect(editor.settingsKey()).toBe('power'); expect(writes).not.toHaveBeenCalled();
  });

  it('keeps a whole-card tap as settings rather than treating Sortable choose as a drag', async () => {
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    const instance = sortable.instances[0], item = first();
    expect(item.tabIndex).toBe(0); expect(item.querySelector('.device-drag-handle')).toBeNull();
    instance.options.onChoose({ item });
    expect(editor.dragging()).toBe(false); expect(editor.settingsId()).toBeNull();
    instance.options.onUnchoose(); await Promise.resolve();
    item.querySelector<HTMLElement>('.device-card')!.click(); fixture.detectChanges();
    expect(editor.settingsId()).toBe('a'); expect(editor.dragging()).toBe(false);
    expect(ids()).toEqual(['a', 'b']);
    expect(navigate).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });

  it('suppresses settings while actually dragging and on its trailing click, but accepts a later tap', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    const instance = sortable.instances[0], item = first();
    instance.options.onChoose({ item }); instance.options.onStart({ item }); fixture.detectChanges();
    expect(editor.dragging()).toBe(true);
    item.click(); expect(editor.settingsId()).toBeNull();
    instance.options.onUnchoose(); instance.options.onEnd({ item, oldIndex: 0, newIndex: 0 }); fixture.detectChanges();
    item.querySelector<HTMLElement>('.device-card')!.click(); expect(editor.settingsId()).toBeNull();
    expect(editor.dragging()).toBe(false);
    await vi.advanceTimersByTimeAsync(351); fixture.detectChanges();
    item.click(); expect(editor.settingsId()).toBe('a');
    expect(ids()).toEqual(['a', 'b']); expect(send).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });

  it('never starts whole-card sorting in normal mode and leaves ordinary arrow scrolling alone', () => {
    const instance = sortable.instances[0], item = first();
    expect(item.classList.contains('sortable-card')).toBe(false);
    expect(item.getAttribute('aria-keyshortcuts')).toBeNull();
    expect(instance.option).toHaveBeenLastCalledWith('disabled', true);
    instance.options.onChoose({ item }); instance.options.onStart({ item });
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    item.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false); expect(editor.dragging()).toBe(false);
    expect(ids()).toEqual(['a', 'b']); expect(editor.editing()).toBe(false);
    expect(send).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });

  it('keeps whole-card keyboard sorting accessible without letting descendant keys reorder it', () => {
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    const item = first();
    const nested = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    item.querySelector('.device-card')!.dispatchEvent(nested);
    expect(ids()).toEqual(['a', 'b']); expect(nested.defaultPrevented).toBe(false);
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    item.dispatchEvent(arrow); fixture.detectChanges();
    expect(ids()).toEqual(['b', 'a']); expect(arrow.defaultPrevented).toBe(true);
    expect(item.getAttribute('aria-keyshortcuts')).toBe('Enter ArrowUp ArrowDown');
    expect(send).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });

  it('stages a real Sortable end without saving; Cancel restores both size and order', () => {
    editor.begin(undefined, ['a', 'b'], 'a'); editor.setLayout('a', 'wide'); fixture.detectChanges();
    expect(first().classList.contains('wide-device')).toBe(true);
    const instance = sortable.instances[0], item = first(), container = item.parentElement!;
    expect(instance.options.handle).toBeUndefined(); expect(instance.options.delay).toBe(0);
    expect(instance.options.fallbackTolerance).toBe(6);
    expect(item.querySelector('.device-card')!.matches(instance.options.filter)).toBe(false);
    instance.options.onChoose({ item });
    instance.options.onStart({ item });
    expect(editor.save()).toBe(false); expect(writes).not.toHaveBeenCalled();
    container.insertBefore(container.children[1], item);
    instance.options.onEnd({ item, oldIndex: 0, newIndex: 1 }); fixture.detectChanges();
    expect(ids()).toEqual(['b', 'a']); expect(writes).not.toHaveBeenCalled();
    editor.cancel(); fixture.detectChanges();
    expect(ids()).toEqual(['a', 'b']); expect(first().classList.contains('wide-device')).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });

  it('saves personal order once and does not reorder saved cards as online evidence changes', () => {
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    fixture.nativeElement.querySelectorAll('.device-card-item')[1].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowUp', bubbles: true,
    })); fixture.detectChanges();
    expect(ids()).toEqual(['b', 'a']); expect(writes).not.toHaveBeenCalled();
    expect(editor.save()).toBe(true); fixture.detectChanges();
    expect(writes).toHaveBeenCalledOnce();
    online.add('a'); data.deviceDataLoader.next(true); fixture.detectChanges();
    expect(ids()).toEqual(['b', 'a']); expect(data.device.list).toEqual(['a', 'b']);
  });

  it('keeps a background draft but disables dragging and releases parent gesture ownership', () => {
    const component = fixture.componentInstance, locks = vi.spyOn(component.swipeEnabled, 'emit');
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    expect(locks).toHaveBeenLastCalledWith(false);
    editor.setActive(false); active.next(false); fixture.detectChanges();
    expect(editor.editing()).toBe(true); expect(locks).toHaveBeenLastCalledWith(true);
    expect(sortable.instances[0].option).toHaveBeenLastCalledWith('disabled', true);
    expect(editor.save()).toBe(false); expect(writes).not.toHaveBeenCalled();
    editor.setActive(true); active.next(true); fixture.detectChanges();
    expect(sortable.instances[0].option).toHaveBeenLastCalledWith('disabled', false);
  });

  it('isolates an interrupted drag from background resume and a successor edit session', () => {
    editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    const previous = sortable.instances[0], item = first();
    previous.options.onChoose({ item });
    previous.options.onStart({ item });
    item.parentElement!.insertBefore(item.parentElement!.children[1], item);
    editor.setActive(false); active.next(false); fixture.detectChanges();
    expect(previous.destroy).toHaveBeenCalledOnce();
    editor.setActive(true); active.next(true); fixture.detectChanges();
    previous.options.onEnd({ item, oldIndex: 0, newIndex: 1 }); fixture.detectChanges();
    expect(ids()).toEqual(['a', 'b']); expect(editor.dirty()).toBe(false);
    editor.cancel(); editor.begin(undefined, ['a', 'b'], 'b'); fixture.detectChanges();
    previous.options.onEnd({ item, oldIndex: 0, newIndex: 1 }); fixture.detectChanges();
    expect(ids()).toEqual(['a', 'b']); expect(editor.selectedId()).toBe('b');
    expect(writes).not.toHaveBeenCalled();
  });

  it('destroys Sortable, clears a pending press and releases parent locks', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pointer(first(), 'pointerdown'); fixture.destroy();
    await vi.advanceTimersByTimeAsync(500);
    expect(editor.editing()).toBe(false); expect(writes).not.toHaveBeenCalled();
    expect(sortable.instances[0].destroy).toHaveBeenCalledOnce();
  });

  it('forwards an explicit card control without navigation, but sends zero commands while editing or backgrounded', () => {
    const card = fixture.debugElement.query(By.directive(CardStub)).componentInstance as CardStub;
    const intent: HomeCardControlIntent = { binding: { key: 'power', kind: 0, type: 0, mode: 'toggle' },
      manifestFingerprint: 'manifest', stateRevision: 1, stateFresh: true };
    card.control.emit(intent);
    expect(send).toHaveBeenCalledExactlyOnceWith('a', intent); expect(navigate).not.toHaveBeenCalled();
    send.mockClear(); editor.begin(undefined, ['a', 'b'], 'a'); fixture.detectChanges();
    card.control.emit(intent); expect(send).not.toHaveBeenCalled();
    editor.cancel(); active.next(false); fixture.detectChanges();
    card.control.emit(intent); expect(send).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });

  it('locks swipe and refresh only during the control gesture, releasing them on background', () => {
    const card = fixture.debugElement.query(By.directive(CardStub)).componentInstance as CardStub;
    const component = fixture.componentInstance, swipe = vi.spyOn(component.swipeEnabled, 'emit');
    const refresh = vi.spyOn(component.refresherEnabled, 'emit');
    card.interactionChange.emit(true);
    expect(swipe).toHaveBeenLastCalledWith(false); expect(refresh).toHaveBeenLastCalledWith(false);
    card.interactionChange.emit(false);
    expect(swipe).toHaveBeenLastCalledWith(true); expect(refresh).toHaveBeenLastCalledWith(true);
    card.interactionChange.emit(true); active.next(false);
    expect(swipe).toHaveBeenLastCalledWith(true); expect(refresh).toHaveBeenLastCalledWith(true);
    active.next(true);
    expect(swipe).toHaveBeenLastCalledWith(true); expect(refresh).toHaveBeenLastCalledWith(true);
  });

  it('does not let Enter on a native control activate the enclosing card link', () => {
    const button = document.createElement('button');
    first().querySelector('.device-card')!.append(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click(); expect(navigate).not.toHaveBeenCalled();
    first().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).toHaveBeenCalledOnce();
  });
});
