import { ElementRef, EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import { PanelSortableDirective, PanelSortItemDirective } from './panel-sortable.directive';

const dnd = vi.hoisted(() => ({ instances: [] as Array<{
  input: Record<string, any>; manager: unknown; index: number; destroy: ReturnType<typeof vi.fn>;
}>, managers: [] as any[] }));

vi.mock('@dnd-kit/dom', async importOriginal => Object.assign(
  {}, await importOriginal<typeof import('@dnd-kit/dom')>(), {
  DragDropManager: class {
    readonly listeners = new Map<string, (event: any) => void>();
    readonly monitor = { addEventListener: (name: string, callback: (event: any) => void) => this.listeners.set(name, callback) };
    readonly registry = { droppables: [] };
    readonly collisionObserver = { disable: vi.fn(), enable: vi.fn() };
    readonly dragOperation = { source: undefined as { id: string } | undefined, status: { idle: true } };
    readonly sensors: Array<{ destroy: () => void }> = [];
    readonly actions = {
      setDropTarget: vi.fn(async () => undefined),
      stop: vi.fn((input: { canceled: boolean }) => {
        this.dragOperation.status.idle = true;
        this.listeners.get('dragend')?.(input);
      }),
    };
    readonly destroy = vi.fn();
    constructor(readonly input: Record<string, any>) { dnd.managers.push(this); }
  },
}));

vi.mock('@dnd-kit/dom/sortable', () => ({
  SortableKeyboardPlugin: class {},
  isSortable: () => false,
  Sortable: class {
    index: number;
    destroy = vi.fn();
    constructor(readonly input: Record<string, any>, readonly manager: unknown) {
      this.index = input['index']; dnd.instances.push(this);
      // Reflect the installed Accessibility plugin's activator ownership.
      // Like Sortable.destroy(), this double deliberately leaves attributes.
      const element = input['element'] as HTMLElement;
      for (const [name, value] of Object.entries({ tabindex: '0', role: 'button',
        'aria-roledescription': 'sortable', 'aria-describedby': 'dnd-instructions' })) {
        if (!element.hasAttribute(name)) element.setAttribute(name, value);
      }
      element.setAttribute('aria-disabled', String(input['disabled']));
      element.setAttribute('aria-pressed', 'false');
      element.setAttribute('aria-grabbed', 'false');
    }
  },
}));

describe('panel sort item has drag ownership only during layout', () => {
  let directive: PanelSortItemDirective;
  let element: HTMLElement;
  let manager: object;

  beforeEach(() => {
    dnd.instances.length = 0; element = document.createElement('div');
    element.innerHTML = '<button type="button">编辑部件</button>';
    manager = {};
    TestBed.configureTestingModule({ providers: [
      { provide: ElementRef, useValue: new ElementRef(element) },
      { provide: PanelSortableDirective, useValue: { manager,
        inlineModeChanged: new EventEmitter<void>(), registerItem: vi.fn(), unregisterItem: vi.fn() } },
    ] });
    directive = TestBed.runInInjectionContext(() => new PanelSortItemDirective());
    directive.panelSortItem = 'widget-a'; directive.sortIndex = 2;
  });
  afterEach(() => { directive.ngOnDestroy(); TestBed.resetTestingModule(); });

  it('does not register an initially disabled item or mark its editing descendants disabled', () => {
    directive.ngOnChanges(); directive.sortIndex = 3; directive.ngOnChanges();
    expect(dnd.instances).toHaveLength(0);
    expect(element.hasAttribute('aria-disabled')).toBe(false);
    expect(element.querySelector('button')!.disabled).toBe(false);
    expect(element.hasAttribute('role')).toBe(false);
  });

  it('creates an enabled layout instance with the original id/index/plugins and updates its index in place', () => {
    directive.sortDisabled = false; directive.ngOnChanges();
    expect(dnd.instances).toHaveLength(1);
    const instance = dnd.instances[0];
    expect(instance.input).toMatchObject({ id: 'widget-a', index: 2, element, disabled: false, transition: null });
    expect(instance.input['plugins']).toHaveLength(1); expect(instance.manager).toBe(manager);
    directive.sortIndex = 4; directive.ngOnChanges();
    expect(dnd.instances).toHaveLength(1); expect(instance.index).toBe(4);
    expect(instance.destroy).not.toHaveBeenCalled();
  });

  it('releases layout ownership once and creates a fresh instance if layout is entered again', () => {
    directive.sortDisabled = false; directive.ngOnChanges(); const first = dnd.instances[0];
    directive.sortDisabled = true; directive.ngOnChanges(); directive.ngOnChanges();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(element.hasAttribute('aria-disabled')).toBe(false);
    expect(element.hasAttribute('tabindex')).toBe(false); expect(element.hasAttribute('role')).toBe(false);
    directive.sortIndex = 6; directive.sortDisabled = false; directive.ngOnChanges();
    expect(dnd.instances).toHaveLength(2); expect(dnd.instances[1].index).toBe(6);
    expect(dnd.instances[1].input['disabled']).toBe(false);
  });

  it('restores the exact original accessibility attributes while leaving unrelated host and child state intact', () => {
    const before = { tabindex: '-1', role: 'group', 'aria-roledescription': '部件',
      'aria-describedby': 'existing-help', 'aria-disabled': 'false', 'aria-pressed': 'mixed', 'aria-grabbed': 'true',
      'aria-label': '原卡片', 'data-widget': 'saved-widget', style: 'color: blue;' };
    for (const [name, value] of Object.entries(before)) element.setAttribute(name, value);
    directive.sortDisabled = false; directive.ngOnChanges();
    expect(element.getAttribute('aria-pressed')).toBe('false');
    directive.sortDisabled = true; directive.ngOnChanges();
    for (const [name, value] of Object.entries(before)) expect(element.getAttribute(name), name).toBe(value);
    expect(element.querySelector('button')!.disabled).toBe(false);
    expect(element.querySelector('button')!.textContent).toBe('编辑部件');
  });

  it('destroys an active instance once even if its host cleanup runs twice', () => {
    directive.sortDisabled = false; directive.ngOnChanges(); const instance = dnd.instances[0];
    directive.ngOnDestroy(); directive.ngOnDestroy();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(element.hasAttribute('aria-disabled')).toBe(false);
    expect(element.hasAttribute('aria-describedby')).toBe(false);
    expect(element.hasAttribute('aria-roledescription')).toBe(false);
    expect(element.hasAttribute('aria-pressed')).toBe(false); expect(element.hasAttribute('aria-grabbed')).toBe(false);
  });
});

describe('inline panel sort distinguishes properties, movement and native cancellation', () => {
  let grid: PanelSortableDirective;
  let directive: PanelSortItemDirective;
  let element: HTMLElement;
  let state: any;
  let tapped: ReturnType<typeof vi.fn>;

  function pointer(type: string, x = 10, y = 10, pointerId = 7, target: EventTarget = element): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId, isPrimary: true, button: 0, clientX: x, clientY: y });
    target.dispatchEvent(event);
    return event;
  }

  function click(): MouseEvent {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    element.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    grid = new PanelSortableDirective();
    grid.sortInline = true;
    state = dnd.managers.at(-1);
    element = document.createElement('div');
    element.innerHTML = '<span class="overlay" aria-hidden="true"></span>';
    document.body.append(element);
    TestBed.configureTestingModule({ providers: [
      { provide: ElementRef, useValue: new ElementRef(element) },
      { provide: PanelSortableDirective, useValue: grid },
    ] });
    directive = TestBed.runInInjectionContext(() => new PanelSortItemDirective());
    directive.panelSortItem = 'inline-widget'; directive.sortIndex = 0;
    directive.sortDisabled = false; directive.ngOnChanges();
    tapped = vi.fn(); grid.sortTapped.subscribe(tapped);
  });

  afterEach(() => {
    directive.ngOnDestroy(); grid.ngOnDestroy(); element.remove();
    vi.unstubAllGlobals(); TestBed.resetTestingModule();
  });

  it('uses the existing sensor with an 8px distance only inline, retaining normal layout activation', () => {
    const pointerOptions = state.input.sensors[0].options;
    const constraints = pointerOptions.activationConstraints();
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toBeInstanceOf(PointerActivationConstraints.Distance);
    expect(constraints[0].options.value).toBe(8);
    const button = document.createElement('button'); element.append(button);
    const event = { target: button, pointerType: 'mouse' };
    expect(pointerOptions.preventActivation(event, { element })).toBe(false);
    grid.sortInline = false;
    expect(pointerOptions.activationConstraints()).toEqual([]);
    expect(pointerOptions.preventActivation(event, { element })).toBe(true);
  });

  it('keeps pointerdown and sub-threshold movement native, then emits exactly one property tap', () => {
    expect(pointer('pointerdown').defaultPrevented).toBe(false);
    expect(pointer('pointermove', 17, 10, 7, document).defaultPrevented).toBe(false);
    pointer('pointerup', 17, 10, 7, document);
    expect(click().defaultPrevented).toBe(true);
    expect(tapped).toHaveBeenCalledExactlyOnceWith('inline-widget');
  });

  it('does not interpret a movement over the threshold or its following click as properties', () => {
    pointer('pointerdown');
    pointer('pointermove', 19, 10, 7, document);
    pointer('pointerup', 19, 10, 7, document);
    click();
    expect(tapped).not.toHaveBeenCalled();
    pointer('pointerdown'); pointer('pointerup', 10, 10, 7, document); click();
    expect(tapped).toHaveBeenCalledExactlyOnceWith('inline-widget');
  });

  it('suppresses the post-drag click, preserving the canceled finish event and next deliberate tap', async () => {
    const started = vi.fn(), finished = vi.fn();
    grid.sortStarted.subscribe(started); grid.sortFinished.subscribe(finished);
    pointer('pointerdown');
    state.listeners.get('dragstart')({});
    expect(grid.dragActive).toBe(true);
    click(); expect(tapped).not.toHaveBeenCalled();
    state.listeners.get('dragend')({ canceled: true });
    pointer('pointerup', 10, 10, 7, document); click();
    await Promise.resolve();
    expect(started).toHaveBeenCalledOnce(); expect(finished).toHaveBeenCalledExactlyOnceWith(true);
    expect(tapped).not.toHaveBeenCalled();
    pointer('pointerdown'); pointer('pointerup', 10, 10, 7, document); click();
    expect(tapped).toHaveBeenCalledExactlyOnceWith('inline-widget');
  });

  it('does not convert pointercancel into a tap and ignores a different pointer cancel', () => {
    pointer('pointerdown'); pointer('pointercancel', 10, 10, 8, document);
    pointer('pointerup', 10, 10, 7, document); click();
    expect(tapped).toHaveBeenCalledOnce(); tapped.mockClear();
    pointer('pointerdown'); pointer('pointercancel', 10, 10, 7, document); click();
    expect(tapped).not.toHaveBeenCalled();
  });

  it('cancels pending activation on native scrolling without preventing scroll or emitting properties', () => {
    const sensor = new PointerSensor(grid.manager);
    const destroy = vi.spyOn(sensor, 'destroy'); state.sensors.push(sensor);
    pointer('pointerdown');
    const scroll = new Event('scroll', { cancelable: true }); element.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false); expect(destroy).toHaveBeenCalledOnce();
    click(); expect(tapped).not.toHaveBeenCalled();
  });

  it('does not cancel an active drag when dnd-kit scrolls the canvas', () => {
    const sensor = new PointerSensor(grid.manager);
    const destroy = vi.spyOn(sensor, 'destroy'); state.sensors.push(sensor);
    pointer('pointerdown'); state.listeners.get('dragstart')({});
    element.dispatchEvent(new Event('scroll'));
    expect(destroy).not.toHaveBeenCalled();
    expect(grid.dragActive).toBe(true); expect(tapped).not.toHaveBeenCalled();
  });

  it('reserves Enter for properties and Space for the existing keyboard sorter', () => {
    const options = state.input.sensors[1].options;
    const source = { element };
    expect(options.preventActivation({ code: 'Space', target: element }, source)).toBe(false);
    expect(options.preventActivation({ code: 'Enter', target: element }, source)).toBe(true);
    const enter = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true });
    element.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(tapped).toHaveBeenCalledExactlyOnceWith('inline-widget');
    tapped.mockClear();
    element.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    expect(tapped).not.toHaveBeenCalled();
    grid.sortInline = false;
    expect(options.preventActivation({ code: 'Enter', target: element }, source)).toBe(false);
  });

  it('does not open properties from Enter finishing a keyboard drag or a repeated Enter', () => {
    state.listeners.get('dragstart')({});
    element.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }));
    expect(tapped).not.toHaveBeenCalled();
    state.listeners.get('dragend')({ canceled: false });
    const ending = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true });
    ending.preventDefault(); element.dispatchEvent(ending);
    element.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', repeat: true, bubbles: true }));
    expect(tapped).not.toHaveBeenCalled();
  });

  it('releases all inline and sensor ownership on disable, including a pending pointer sequence', () => {
    const destroy = vi.fn(); state.sensors.push({ destroy });
    pointer('pointerdown');
    directive.sortDisabled = true; directive.ngOnChanges();
    expect(destroy).toHaveBeenCalledOnce();
    expect(element.hasAttribute('role')).toBe(false); expect(element.hasAttribute('tabindex')).toBe(false);
    pointer('pointermove', 30, 10, 7, document);
    expect(click().defaultPrevented).toBe(false);
    const enter = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true });
    element.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false); expect(tapped).not.toHaveBeenCalled();
    directive.ngOnChanges(); expect(destroy).toHaveBeenCalledOnce();
  });

  it('stops an owned active sort as canceled when its item is disabled', () => {
    state.dragOperation.source = { id: 'inline-widget' }; state.dragOperation.status.idle = false;
    state.listeners.get('dragstart')({});
    const finished = vi.fn(); grid.sortFinished.subscribe(finished);
    directive.sortDisabled = true; directive.ngOnChanges();
    expect(state.actions.stop).toHaveBeenCalledExactlyOnceWith({ canceled: true });
    expect(finished).toHaveBeenCalledExactlyOnceWith(true);
    expect(grid.dragActive).toBe(false);
  });

  it('removes inline handlers when returning to routed layout, without destroying its sortable', () => {
    const instance = dnd.instances.at(-1)!;
    grid.sortInline = false; grid.ngOnChanges();
    expect(instance.destroy).not.toHaveBeenCalled(); expect(click().defaultPrevented).toBe(false);
    expect(tapped).not.toHaveBeenCalled();
    grid.sortInline = true; grid.ngOnChanges(); click();
    expect(tapped).toHaveBeenCalledExactlyOnceWith('inline-widget');
  });

  it('ignores late monitor callbacks after owner destruction', () => {
    const started = vi.fn(), finished = vi.fn();
    grid.sortStarted.subscribe(started); grid.sortFinished.subscribe(finished);
    grid.ngOnDestroy();
    state.listeners.get('dragstart')({}); state.listeners.get('dragend')({ canceled: false });
    expect(started).not.toHaveBeenCalled(); expect(finished).not.toHaveBeenCalled();
  });
});
