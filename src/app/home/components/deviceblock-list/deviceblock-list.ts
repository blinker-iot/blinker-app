import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import Sortable from 'sortablejs';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceUiPort } from 'src/app/core/device-v2/device-ui.port';
import { API } from 'src/app/configs/api.config';
import { DeviceCardEditor } from '../../device-card-editor.service';
import { Deviceblock } from '../deviceblock/deviceblock';
import { getDeviceRoute } from './device-navigation';
import { DeviceCardControl } from '../../device-card-control.service';
import { HomeCardControlIntent } from '../../device-card-control.models';

@Component({
  selector: 'deviceblock-list',
  templateUrl: 'deviceblock-list.html',
  styleUrls: ['deviceblock-list.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Deviceblock],
})

export class DeviceblockListComponent implements AfterViewInit, OnDestroy {
  @Output() swipeEnabled = new EventEmitter<boolean>();
  @Output() refresherEnabled = new EventEmitter<boolean>();
  private currentRoom?: string;
  @Input()
  set roomName(value: string | undefined) {
    if (value !== this.currentRoom) {
      this.cancelPress();
      if (this.cardEditor.isEditingView(this.currentRoom)) this.cardEditor.cancel('区域已变化，请重新编辑卡片。');
    }
    this.currentRoom = value;
  }
  get roomName(): string | undefined { return this.currentRoom; }
  @ViewChild('sortbox') sortbox: ElementRef<HTMLElement>;

  private cardRead?: AbortController;
  private appActive = true;
  private viewInitialized = false;
  private sortable?: Sortable;
  private sortableGeneration = 0;
  private drag?: { generation: number; item: HTMLElement; index: number };
  private isSorting = false;
  private wasEditing = false;
  private suppressNavigationUntil = 0;
  private suppressEditorClickUntil = 0;
  private controlGesture = false;
  private press?: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> };

  private readonly sortableOptions = {
    animation: 160,
    disabled: true,
    delay: 0,
    fallbackTolerance: 6,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackClass: 'sdrag',
    ghostClass: 'sghost',
    chosenClass: 'schosen',
    dragClass: 'sdrag',
    draggable: '.deviceblock',
    filter: 'button, a, input, select, textarea',
    preventOnFilter: false,
    dataIdAttr: 'data-id',
    onChoose: (event: Sortable.SortableEvent) => {
      if (!this.interactiveEditor) return;
      const id = event.item.getAttribute('data-id');
      if (id) this.cardEditor.select(id);
      this.drag = { generation: this.cardEditor.generation(), item: event.item,
        index: Array.from(this.sortbox.nativeElement.children).indexOf(event.item) };
    },
    onStart: (event: Sortable.SortableEvent): void => {
      if (!this.interactiveEditor) return;
      if (this.drag?.item !== event.item) this.sortableOptions.onChoose(event);
      if (!this.drag || this.drag.generation !== this.cardEditor.generation()) return;
      this.isSorting = true;
      this.cardEditor.setDragging(true);
      this.suppressNavigationUntil = Number.POSITIVE_INFINITY;
      this.syncInteraction();
    },
    onEnd: (event: Sortable.SortableEvent) => {
      if (!this.drag || this.drag.item !== event.item) return;
      if (this.isSorting && this.sortable && event.oldIndex !== undefined && event.oldIndex !== event.newIndex) {
        const order = this.sortable.toArray();
        const container = this.sortbox.nativeElement;

        // Restore Angular's previous DOM order before it applies the sorted list.
        event.item.remove();
        container.insertBefore(event.item, container.children[event.oldIndex] ?? null);
        if (this.interactiveEditor && this.drag.generation === this.cardEditor.generation()) this.cardEditor.reorder(order);
      }

      this.finishSorting();
    },
    // Sortable emits unchoose before end, including when a press is cancelled.
    onUnchoose: () => {
      const drag = this.drag;
      queueMicrotask(() => { if (drag === this.drag) this.finishSorting(); });
    },
  };

  get deviceDataList(): string[] {
    const list: string[] = typeof this.roomName === 'undefined'
      ? this.dataService.device?.list || []
      : this.dataService.room?.dict?.[this.roomName] || [];

    const visible = list.filter(id => Object.hasOwn(this.deviceDataDict, id) && !this.deviceDataDict[id].config?.disabled).sort((left, right) => (
      Number(this.deviceUi.isOnline(right)) - Number(this.deviceUi.isOnline(left))
    ));
    return this.cardEditor.order(this.roomName, visible);
  }

  get deviceDataDict() {
    return this.dataService.device?.dict || {};
  }

  constructor(
    private router: Router,
    private dataService: DataService,
    private deviceUi: DeviceUiPort,
    private cd: ChangeDetectorRef,
    destroyRef: DestroyRef,
    readonly cardEditor: DeviceCardEditor,
    readonly cardControls: DeviceCardControl,
  ) {
    effect(() => {
      const editing = this.editing;
      this.cardEditor.active();
      this.cardEditor.saving();
      this.cardEditor.generation();
      this.cardEditor.settingsId();
      if (this.wasEditing && !editing) this.suppressNavigationUntil = Date.now() + 350;
      this.wasEditing = editing;
      this.syncInteraction();
    });
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.cd.markForCheck();
      });

    this.dataService.deviceDataLoader
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.cd.markForCheck();
        this.refreshCardStates();
      });

    this.deviceUi.appActive
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(active => {
        this.appActive = active;
        this.syncInteraction();
        this.refreshCardStates();
      });

    this.router.events
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(event => {
        if (event instanceof NavigationStart) { this.cardRead?.abort(); this.cancelPress(); }
        if (event instanceof NavigationEnd) this.refreshCardStates();
      });
  }

  ngAfterViewInit() {
    this.viewInitialized = true;

    this.createSortable();
    this.syncInteraction();
    this.refreshCardStates();
  }

  ngOnDestroy() {
    this.cancelPress();
    this.cardRead?.abort();
    this.sortableGeneration++;
    this.sortable?.destroy();

    this.sortable = undefined;
    this.cardEditor.setDragging(false);
    this.controlGesture = false;
    this.setParentGesturesEnabled(true);
  }

  isWideDevice(deviceId: string): boolean {
    return this.cardEditor.layout(deviceId) === 'wide';
  }

  get editing(): boolean { return this.cardEditor.editing() && this.cardEditor.isEditingView(this.roomName); }

  get interactiveEditor(): boolean { return this.editing && this.appActive && this.cardEditor.active() && !this.cardEditor.saving() && !this.cardEditor.settingsId(); }

  get controlsEnabled(): boolean {
    return !this.cardEditor.editing() && this.appActive && this.cardEditor.active()
      && this.router.url.split(/[?#]/, 1)[0] === '/home/device';
  }

  control(deviceId: string, intent: HomeCardControlIntent): void {
    if (this.controlsEnabled && Date.now() >= this.suppressNavigationUntil) void this.cardControls.control(deviceId, intent);
  }

  controlInteraction(active: boolean): void {
    this.cancelPress();
    this.controlGesture = active && this.controlsEnabled;
    this.syncInteraction();
  }

  onCardClick(deviceId: string, event: Event): void {
    if (this.editing) { event.stopPropagation(); this.configureCard(deviceId); return; }
    // Native buttons emit their own click on Enter; the card's keyboard link
    // must not navigate first or turn a disabled control into navigation.
    if ((event.target as Element | null)?.closest('button, a, input, select, textarea')) return;
    if (Date.now() < this.suppressNavigationUntil) return;
    if (!this.deviceDataDict[deviceId]) return;

    void this.router.navigate(getDeviceRoute(deviceId));
  }

  configureCard(deviceId: string, key?: string): void {
    if (!this.isSorting && this.interactiveEditor && Date.now() >= this.suppressEditorClickUntil) this.cardEditor.openSettings(deviceId, key);
  }

  onPress(deviceId: string, event: PointerEvent): void {
    this.cancelPress();
    if (this.editing || !this.appActive || !this.cardEditor.active()
      || event.isPrimary === false || event.button > 0
      || (event.target as Element)?.closest('button, a, input, select, textarea')) return;
    const epoch = this.dataService.sessionEpoch, account = this.dataService.auth?.uuid, authority = API.BASE_URL;
    const timer = setTimeout(() => {
      this.press = undefined;
      if (epoch !== this.dataService.sessionEpoch || account !== this.dataService.auth?.uuid || authority !== API.BASE_URL) return;
      if (this.cardEditor.begin(this.roomName, this.deviceDataList, deviceId)) {
        this.suppressEditorClickUntil = Date.now() + 350;
        this.suppressNavigationUntil = Number.POSITIVE_INFINITY;
        this.syncInteraction();
        this.cd.markForCheck();
      }
    }, 450);
    this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, timer };
  }

  onPressMove(event: PointerEvent): void {
    if (this.press && (event.pointerId !== this.press.id
      || Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) >= 7)) this.cancelPress();
  }

  cancelPress(): void {
    if (this.press) clearTimeout(this.press.timer);
    this.press = undefined;
  }

  onContextMenu(deviceId: string, event: Event): void {
    event.preventDefault();
    this.cancelPress();
    if (this.appActive && this.cardEditor.active()) this.cardEditor.begin(this.roomName, this.deviceDataList, deviceId);
  }

  moveDevice(deviceId: string, delta: number, event: Event): void {
    if (!this.interactiveEditor || this.isSorting || event.target !== event.currentTarget) return;
    event.preventDefault(); event.stopPropagation();
    const order = this.deviceDataList;
    const index = order.indexOf(deviceId), next = index + delta;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    this.cardEditor.reorder(order);
  }

  private syncInteraction(): void {
    const locked = (this.editing || this.controlGesture) && this.appActive && this.cardEditor.active();
    if (this.drag && (!this.interactiveEditor || this.drag.generation !== this.cardEditor.generation())) {
      const { item, index } = this.drag;
      const parent = this.sortbox.nativeElement;
      this.drag = undefined;
      this.isSorting = false;
      this.suppressEditorClickUntil = Date.now() + 350;
      if (item.parentElement === parent) {
        item.remove(); parent.insertBefore(item, parent.children[index] ?? null);
      }
      // Destroy the interrupted native drag. Old callbacks cannot mutate a resumed editor.
      this.sortableGeneration++;
      this.sortable?.destroy();
      this.createSortable();
      this.cardEditor.setDragging(false);
    }
    this.sortable?.option('disabled', !this.interactiveEditor);
    this.setParentGesturesEnabled(!locked);
    if (!this.appActive || !this.cardEditor.active()) { this.controlGesture = false; this.cancelPress(); }
  }

  private finishSorting() {
    if (!this.drag && !this.isSorting) return;

    const moved = this.isSorting;
    this.isSorting = false;
    this.drag = undefined;
    this.cardEditor.setDragging(false);
    // Sortable chooses on pointer-down even for an ordinary tap. Only a real
    // drag suppresses the trailing click; a tap must still open card settings.
    if (moved) {
      this.suppressEditorClickUntil = Date.now() + 350;
      this.suppressNavigationUntil = this.editing ? Number.POSITIVE_INFINITY : Date.now() + 350;
    }
    this.syncInteraction();
    this.cd.markForCheck();
  }

  private createSortable(): void {
    const generation = ++this.sortableGeneration;
    this.sortable = new Sortable(this.sortbox.nativeElement, { ...this.sortableOptions,
      onChoose: event => { if (generation === this.sortableGeneration) this.sortableOptions.onChoose(event); },
      onStart: event => { if (generation === this.sortableGeneration) this.sortableOptions.onStart(event); },
      onEnd: event => { if (generation === this.sortableGeneration) this.sortableOptions.onEnd(event); },
      onUnchoose: () => { if (generation === this.sortableGeneration) this.sortableOptions.onUnchoose(); },
    });
  }

  private setParentGesturesEnabled(enabled: boolean) {
    this.swipeEnabled.emit(enabled);
    this.refresherEnabled.emit(enabled);
  }

  private refreshCardStates(): void {
    this.cardRead?.abort();

    if (!this.viewInitialized || !this.appActive
      || this.router.url.split(/[?#]/, 1)[0] !== '/home/device') return;

    const controller = new AbortController();

    this.cardRead = controller;

    void this.deviceUi.refreshCardStates(this.deviceDataList, controller.signal)
      .finally(() => {
        if (this.cardRead === controller) this.cardRead = undefined;
      });
  }

  // The parent tab owns cancellable BLE discovery for the whole inventory.
  // Lists only read cached Cloud state; room lists must not start extra scans.
}
