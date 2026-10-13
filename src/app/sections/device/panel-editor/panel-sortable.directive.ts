import { Directive, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { DragDropManager, KeyboardSensor, PointerSensor } from '@dnd-kit/dom';
import { Sortable, SortableKeyboardPlugin, isSortable } from '@dnd-kit/dom/sortable';
export interface PanelSortMove { from: string; to: string; }

@Directive({ selector: '[panelSortable]', standalone: true })

export class PanelSortableDirective implements OnDestroy {
  @Output() sortStarted = new EventEmitter<void>();
  @Output() sortMoved = new EventEmitter<PanelSortMove>();
  @Output() sortFinished = new EventEmitter<boolean>();

  readonly manager = new DragDropManager({
    sensors: [PointerSensor.configure({ activationConstraints: [] }), KeyboardSensor],
  });

  private readonly animations = new Map<Element, Animation>();
  private destroyed = false;

  constructor() {
    this.manager.monitor.addEventListener('dragstart', () => this.sortStarted.emit());

    this.manager.monitor.addEventListener('dragover', event => {
      const { source, target } = event.operation;

      if (!isSortable(source) || !isSortable(target) || source.id === target.id) return;

      this.manager.collisionObserver.disable();

      void this.animateLayout(() => this.sortMoved.emit({ from: String(source.id), to: String(target.id) }))
        .then(() => {
          if (!this.destroyed) return this.manager.actions.setDropTarget(source.id);
        })
        .then(() => {
          if (!this.destroyed) this.manager.collisionObserver.enable();
        });
    });

    this.manager.monitor.addEventListener('dragend', event => {
      void this.animateLayout(() => this.sortFinished.emit(event.canceled));
    });
  }

  private async animateLayout(update: () => void): Promise<void> {
    const sourceId = this.manager.dragOperation.source?.id;
    const before = new Map<Element, DOMRect>();

    for (const droppable of this.manager.registry.droppables) {
      if (!isSortable(droppable) || droppable.id === sourceId) continue;

      const card = droppable.sortable.element?.firstElementChild;

      if (card) before.set(card, card.getBoundingClientRect());
    }

    // Capture the current animated position before replacing the animation.
    for (const animation of this.animations.values()) animation.cancel();

    this.animations.clear();
    update();

    // Feedback moves its placeholder in a MutationObserver after Angular's
    // render. Measure only after that move has settled the final grid layout.
    await Promise.resolve();

    if (this.destroyed) return;

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

  ngOnDestroy(): void {
    this.destroyed = true;

    for (const animation of this.animations.values()) animation.cancel();

    this.animations.clear();
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

  ngOnChanges(): void {
    if (!this.sortable) {
      this.sortable = new Sortable({
        id: this.panelSortItem,
        index: this.sortIndex,
        element: this.element,
        disabled: this.sortDisabled,
        transition: null,
        // Angular owns DOM ordering, including during the drag preview.
        plugins: [SortableKeyboardPlugin],
      }, this.grid.manager);

      return;
    }

    this.sortable.index = this.sortIndex;
    this.sortable.disabled = this.sortDisabled;
  }

  ngOnDestroy(): void { this.sortable?.destroy(); }
}
