import { Directive, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { DragDropManager, KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import { Sortable, SortableKeyboardPlugin, isSortable } from '@dnd-kit/dom/sortable';
export interface PanelSortMove { from: string; to: string; }
// @dnd-kit/dom Accessibility writes these on the drag activator and does not
// restore them when a Sortable is destroyed. Keep unrelated host state intact.
const SORT_ACCESSIBILITY_ATTRIBUTES = ['tabindex', 'role', 'aria-roledescription',
  'aria-describedby', 'aria-pressed', 'aria-grabbed', 'aria-disabled'];
const INLINE_DRAG_DISTANCE = 8;

@Directive({ selector: '[panelSortable]', standalone: true })

export class PanelSortableDirective implements OnChanges, OnDestroy {
  @Input() sortInline = false;
  @Output() sortStarted = new EventEmitter<void>();
  @Output() sortMoved = new EventEmitter<PanelSortMove>();
  @Output() sortFinished = new EventEmitter<boolean>();
  @Output() sortTapped = new EventEmitter<string>();

  readonly inlineModeChanged = new EventEmitter<void>();

  readonly manager = new DragDropManager({
    sensors: [PointerSensor.configure({
      activationConstraints: () => this.sortInline
        ? [new PointerActivationConstraints.Distance({ value: INLINE_DRAG_DISTANCE })] : [],
      preventActivation: (event, source) => this.sortInline
        ? false : PointerSensor.defaults.preventActivation!(event, source),
    }), KeyboardSensor.configure({
      // Enter opens inline properties; Space, arrows and Escape keep the
      // existing sortable keyboard interaction. The routed layout is unchanged.
      preventActivation: (event, source) => this.sortInline && event.code === 'Enter'
        || KeyboardSensor.defaults.preventActivation(event, source),
    })],
  });

  private readonly animations = new Map<Element, Animation>();
  private readonly items = new Set<string>();
  private suppressTap = false;
  private dragging = false;
  private generation = 0;
  private destroyed = false;

  constructor() {
    this.manager.monitor.addEventListener('dragstart', () => {
      if (this.destroyed || !this.items.size) return;
      this.generation++;
      this.dragging = true;
      this.suppressTap = true;
      this.sortStarted.emit();
    });

    this.manager.monitor.addEventListener('dragover', event => {
      if (this.destroyed || !this.items.size) return;
      const { source, target } = event.operation;

      if (!isSortable(source) || !isSortable(target) || source.id === target.id) return;

      this.manager.collisionObserver.disable();
      const generation = this.generation;

      void this.animateLayout(() => this.sortMoved.emit({ from: String(source.id), to: String(target.id) }))
        .then(() => {
          if (!this.destroyed && generation === this.generation) return this.manager.actions.setDropTarget(source.id);
        })
        .then(() => {
          if (!this.destroyed) this.manager.collisionObserver.enable();
        });
    });

    this.manager.monitor.addEventListener('dragend', event => {
      if (this.destroyed || !this.items.size) return;
      this.generation++;
      this.dragging = false;
      void this.animateLayout(() => this.sortFinished.emit(event.canceled));
    });
  }

  ngOnChanges(): void { this.inlineModeChanged.emit(); }

  get dragActive(): boolean { return this.dragging; }

  registerItem(id: string): void { this.items.add(id); }

  unregisterItem(id: string): void {
    if (this.manager.dragOperation.source?.id === id && !this.manager.dragOperation.status.idle) {
      this.manager.actions.stop({ canceled: true });
    }
    this.items.delete(id);
    if (!this.items.size) {
      // Sortable.destroy removes the item's bindings, but a sensor may still
      // own document listeners while waiting for its activation threshold.
      for (const sensor of this.manager.sensors) sensor.destroy();
      this.generation++;
      this.suppressTap = false;
      this.clearAnimations();
    }
  }

  beginTap(): void { this.suppressTap = false; }
  blockTap(): void { this.suppressTap = true; }

  cancelPendingPointer(): void {
    if (!this.dragging) {
      for (const sensor of this.manager.sensors) if (sensor instanceof PointerSensor) sensor.destroy();
    }
  }

  tap(id: string, event: Event): void {
    if (!this.sortInline || this.destroyed || !this.items.has(id)) return;
    const prevented = event.defaultPrevented;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!prevented && !this.dragging && !this.suppressTap) this.sortTapped.emit(id);
  }

  private async animateLayout(update: () => void): Promise<void> {
    if (this.destroyed) return;
    const generation = this.generation;
    const sourceId = this.manager.dragOperation.source?.id;
    const before = new Map<Element, DOMRect>();

    for (const droppable of this.manager.registry.droppables) {
      if (!isSortable(droppable) || droppable.id === sourceId) continue;

      const card = droppable.sortable.element?.firstElementChild;

      if (card) before.set(card, card.getBoundingClientRect());
    }

    // Capture the current animated position before replacing the animation.
    this.clearAnimations();
    update();

    // Feedback moves its placeholder in a MutationObserver after Angular's
    // render. Measure only after that move has settled the final grid layout.
    await Promise.resolve();

    if (this.destroyed || generation !== this.generation) return;

    for (const droppable of this.manager.registry.droppables) droppable.refreshShape();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (const [card, rect] of before) {
      const after = card.getBoundingClientRect();
      const x = rect.left - after.left;
      const y = rect.top - after.top;

      if (!x && !y) continue;

      // Animate the card, leaving its grid cell available at the new location
      // for collision detection. This also covers cells whose index is unchanged.
      const animation = card.animate([
        { translate: `${x}px ${y}px` },
        { translate: '0px 0px' },
      ], { duration: 240, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });

      this.animations.set(card, animation);

      animation.onfinish = () => {
        if (this.animations.get(card) === animation) this.animations.delete(card);
      };
    }
  }

  private clearAnimations(): void {
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.generation++;
    this.inlineModeChanged.complete();

    this.clearAnimations();
    this.manager.destroy();
  }
}

@Directive({ selector: '[panelSortItem]', standalone: true })

export class PanelSortItemDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) panelSortItem!: string;
  @Input({ required: true }) sortIndex!: number;
  @Input() sortDisabled = true;

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly grid = inject(PanelSortableDirective);
  private sortable?: Sortable;
  private sortAttributes?: Map<string, string | null>;
  private releaseInline?: () => void;
  private readonly modeSubscription = this.grid.inlineModeChanged.subscribe(() => this.updateInlineBindings());

  ngOnChanges(): void {
    if (this.sortDisabled) {
      this.releaseSortable();
      return;
    }

    if (!this.sortable) {
      this.sortAttributes = new Map(SORT_ACCESSIBILITY_ATTRIBUTES.map(name => [name, this.element.getAttribute(name)]));
      this.sortable = new Sortable({
        id: this.panelSortItem,
        index: this.sortIndex,
        element: this.element,
        disabled: false,
        transition: null,
        // Angular owns DOM ordering, including during the drag preview.
        plugins: [SortableKeyboardPlugin],
      }, this.grid.manager);
      this.grid.registerItem(this.panelSortItem);
      this.updateInlineBindings();

      return;
    }

    this.sortable.index = this.sortIndex;
    this.updateInlineBindings();
  }

  private updateInlineBindings(): void {
    if (!this.sortable || !this.grid.sortInline) {
      this.releaseInline?.();
      this.releaseInline = undefined;
      return;
    }
    if (this.releaseInline) return;
    const document = this.element.ownerDocument;
    let press: { pointerId: number; x: number; y: number } | undefined;
    const stopTracking = () => {
      press = undefined;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('scroll', scroll, true);
    };
    const move = (event: PointerEvent) => {
      if (press?.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > INLINE_DRAG_DISTANCE) this.grid.blockTap();
    };
    const up = (event: PointerEvent) => {
      if (press?.pointerId === event.pointerId) { move(event); stopTracking(); }
    };
    const cancel = (event: PointerEvent) => {
      if (press?.pointerId !== event.pointerId) return;
      this.grid.blockTap();
      stopTracking();
    };
    const scroll = () => {
      if (this.grid.dragActive) return;
      this.grid.blockTap();
      this.grid.cancelPendingPointer();
      stopTracking();
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      stopTracking();
      this.grid.beginTap();
      press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      // Do not prevent pointerdown or native scrolling. Only an active dnd-kit
      // drag may capture a pointer; cancellation and scroll can never be taps.
      document.addEventListener('pointermove', move, { capture: true, passive: true });
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', cancel, true);
      document.addEventListener('scroll', scroll, { capture: true, passive: true });
    };
    const click = (event: MouseEvent) => {
      if (event.button === 0) this.grid.tap(this.panelSortItem, event);
    };
    const key = (event: KeyboardEvent) => {
      if (event.target !== this.element || event.code !== 'Enter' || event.repeat || event.defaultPrevented
        || this.grid.dragActive) return;
      this.grid.beginTap();
      this.grid.tap(this.panelSortItem, event);
    };
    this.element.addEventListener('pointerdown', down, true);
    this.element.addEventListener('click', click, true);
    this.element.addEventListener('keydown', key, true);
    this.releaseInline = () => {
      stopTracking();
      this.element.removeEventListener('pointerdown', down, true);
      this.element.removeEventListener('click', click, true);
      this.element.removeEventListener('keydown', key, true);
    };
  }

  private releaseSortable(): void {
    if (!this.sortable) return;
    this.releaseInline?.();
    this.releaseInline = undefined;
    this.grid.unregisterItem(this.panelSortItem);
    this.sortable.destroy();
    this.sortable = undefined;
    for (const [name, value] of this.sortAttributes!) {
      if (value === null) this.element.removeAttribute(name);
      else this.element.setAttribute(name, value);
    }
    this.sortAttributes = undefined;
  }

  ngOnDestroy(): void { this.modeSubscription.unsubscribe(); this.releaseSortable(); }
}
