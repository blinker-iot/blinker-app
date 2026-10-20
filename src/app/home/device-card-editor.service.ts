import { DestroyRef, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { API } from '../configs/api.config';
import { captureDeviceV2AccountContext, DeviceV2AccountContext } from '../core/device-v2/account-scope';
import { DataService } from '../core/services/data.service';
import {
  HomeCardBinding, HomeCardLayout, HomeCardPreferences, HomeCardPreferenceSnapshot, HomeCardPreferencesStore,
  homeCardViewKey, orderedDeviceIds,
} from './device-card-preferences';
import { DeviceUiSnapshot } from '../core/device-v2/device-ui.port';
import { canWriteDeviceEndpoint } from '../core/device-v2/endpoint-control';
import { homeCardBindingField, homeCardSpan, legacyCardBindings } from './components/deviceblock/device-card-presentation';

interface CardDraft {
  context: DeviceV2AccountContext;
  roomName?: string;
  base: HomeCardPreferenceSnapshot;
  value: HomeCardPreferences;
  originalOrder: string[];
  order: string[];
  fallbacks: Record<string, HomeCardLayout>;
  singleDevice?: string;
}

// Provided by the device tab, not a global connection or device-config owner.
@Injectable()
export class DeviceCardEditor {
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly active = signal(true);
  readonly dragging = signal(false);
  readonly generation = signal(0);
  readonly settingsId = signal<string | null>(null);
  readonly settingsKey = signal<string | undefined>(undefined);
  readonly settingsGeneration = signal(0);
  readonly single = signal(false);
  private readonly changes = signal(0);
  private context?: DeviceV2AccountContext;
  private store?: HomeCardPreferencesStore;
  private saved?: HomeCardPreferenceSnapshot;
  private draft?: CardDraft;
  private readonly capacities = new Map<string, number>();
  private readonly rangesFit = new Map<string, boolean>();

  constructor(private readonly data: DataService, destroyRef: DestroyRef) {
    merge(data.authDataChanged, data.userDataLoader, data.deviceDataLoader)
      .pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.refresh());
    this.refresh();
    destroyRef.onDestroy(() => this.cancel());
  }

  refresh(reloadSaved = false): void {
    const context = this.account();
    if (!sameAccount(context, this.context)) {
      this.cancel();
      this.context = context;
      this.store = undefined;
      this.saved = undefined;
      this.capacities.clear();
      this.rangesFit.clear();
      if (context) this.load(context);
    } else {
      if (this.draft && !this.validDraft(this.draft)) this.cancel('设备或区域已变化，请重新编辑卡片。');
      // Another page has its own editor. Re-entry consumes its saved preferences,
      // but a background draft must retain its original raw CAS baseline.
      if (reloadSaved && !this.draft && context) this.load(context);
    }
    this.changes.update(value => value + 1);
  }

  begin(roomName: string | undefined, baseIds: string[], selectedId: string): boolean {
    if (!this.active() || this.saving()) return false;
    this.refresh();
    if (!this.context) { this.error.set('请先登录，再编辑个人设备卡片。'); return false; }
    if (this.draft) { this.select(selectedId); return this.isEditingView(roomName); }
    this.load(this.context);
    if (!this.saved) return false;
    const visible = this.visibleIds(roomName);
    if (!visible.includes(selectedId) || baseIds.some(id => !visible.includes(id))) return false;
    const order = orderedDeviceIds(baseIds, this.saved.value.orders[homeCardViewKey(roomName)]);
    const fallbacks: Record<string, HomeCardLayout> = Object.create(null);
    for (const id of order) fallbacks[id] = this.fallback(id);
    this.draft = { context: this.context, roomName, base: this.saved, value: structuredClone(this.saved.value),
      originalOrder: [...order], order, fallbacks };
    this.error.set(null);
    this.selectedId.set(selectedId);
    this.generation.update(value => value + 1);
    this.editing.set(true);
    this.changes.update(value => value + 1);
    return true;
  }

  isEditingView(roomName: string | undefined): boolean {
    return !!this.draft && this.draft.roomName === roomName;
  }

  // Device settings shares the editor but must never rewrite an entire view's order.
  beginSingle(id: string): boolean {
    if (this.editing() || !this.begin(undefined, [id], id)) return false;
    this.draft!.singleDevice = id;
    this.single.set(true);
    return true;
  }

  openSettings(id: string, key?: string): void {
    if (this.dragging() || !this.canEdit() || !this.visibleIds(this.draft!.roomName).includes(id)) return;
    this.selectedId.set(id);
    this.settingsKey.set(key);
    this.settingsGeneration.update(value => value + 1);
    this.settingsId.set(id);
  }

  closeSettings(): void {
    this.settingsId.set(null);
    this.settingsKey.set(undefined);
    this.settingsGeneration.update(value => value + 1);
  }

  bindings(id: string): readonly HomeCardBinding[] | undefined {
    this.changes();
    const slots = (this.draft?.value ?? this.saved?.value)?.slots;
    return slots && Object.hasOwn(slots, id) ? slots[id] : undefined;
  }

  setCapacity(id: string, layout: HomeCardLayout, columns: number): void {
    const key = `${layout}:${id}`;
    if (Number.isInteger(columns) && columns >= 1 && columns <= 4 && this.capacities.get(key) !== columns) {
      this.capacities.set(key, columns);
      this.changes.update(value => value + 1);
    }
  }

  capacity(id: string, layout: HomeCardLayout): number | undefined {
    this.changes();
    return this.capacities.get(`${layout}:${id}`);
  }

  setRangeFits(id: string, layout: HomeCardLayout, fits: boolean): void {
    const key = `${layout}:${id}`;
    if (this.rangesFit.get(key) !== fits) {
      this.rangesFit.set(key, fits);
      this.changes.update(value => value + 1);
    }
  }

  rangeFits(id: string, layout: HomeCardLayout): boolean | undefined {
    this.changes();
    return this.rangesFit.get(`${layout}:${id}`);
  }

  // A panel edits its own copy; only Done applies it to the outer draft.
  applySettings(id: string, layout: HomeCardLayout, bindings: readonly HomeCardBinding[] | undefined,
    snapshot: DeviceUiSnapshot | undefined, observed?: { capacity: number; rangeFits: boolean }): boolean {
    if (!this.canEdit() || this.settingsId() !== id || !this.visibleIds(this.draft!.roomName).includes(id)
      || !['standard', 'wide'].includes(layout)) return false;
    if (bindings !== undefined) {
      const device = this.data.device?.dict?.[id];
      const previous = this.bindings(id) ?? legacyCardBindings(device, snapshot) ?? [];
      const changed = bindings.filter(binding => !previous.some(old => sameBinding(old, binding)));
      const columns = bindings.reduce((total, binding) => total + homeCardSpan(binding), 0);
      const capacity = Math.min(this.capacity(id, layout) ?? 4, observed?.capacity ?? this.capacity(id, layout) ?? 1);
      const rangeFits = observed ? observed.rangeFits && this.rangeFits(id, layout) !== false : this.rangeFits(id, layout) === true;
      if (bindings.length > 4 || new Set(bindings.map(binding => binding.key)).size !== bindings.length
        || columns > 4 || changed.some(binding => {
          const field = homeCardBindingField(snapshot, binding);
          return !field || ((binding.mode ?? 'read') !== 'read' && !canWriteDeviceEndpoint(device, field));
        })) {
        this.error.set('设备能力已变化，请核对小块后重试；本次修改仍保留。');
        return false;
      }
      if (changed.length && (columns > capacity || !Number.isInteger(capacity) || capacity < 1
        || changed.some(binding => binding.mode === 'range') && !rangeFits)) {
        this.error.set('当前卡片宽度不足，请减少小块或使用长卡；原配置仍保留。');
        return false;
      }
      Object.defineProperty(this.draft!.value.slots, id,
        { value: bindings.map(binding => ({ ...binding })), enumerable: true, configurable: true, writable: true });
    }
    this.setLayout(id, layout);
    this.error.set(null);
    this.changes.update(value => value + 1);
    return true;
  }

  order(roomName: string | undefined, baseIds: string[]): string[] {
    this.changes();
    const preferred = this.isEditingView(roomName) ? this.draft!.order
      : this.saved?.value.orders[homeCardViewKey(roomName)];
    return orderedDeviceIds(baseIds, preferred);
  }

  layout(id: string): HomeCardLayout {
    this.changes();
    const layouts = (this.draft?.value ?? this.saved?.value)?.layouts;
    return layouts && Object.hasOwn(layouts, id) ? layouts[id] : this.fallback(id);
  }

  select(id: string): void {
    if (this.canEdit() && this.visibleIds(this.draft!.roomName).includes(id)) this.selectedId.set(id);
  }

  setLayout(id: string, layout: HomeCardLayout): void {
    if (!this.canEdit() || !this.visibleIds(this.draft!.roomName).includes(id) || !['standard', 'wide'].includes(layout)) return;
    const draft = this.draft!;
    if (!Object.hasOwn(draft.base.value.layouts, id) && layout === (draft.fallbacks[id] ?? this.fallback(id))) delete draft.value.layouts[id];
    else Object.defineProperty(draft.value.layouts, id, { value: layout, enumerable: true, configurable: true, writable: true });
    this.changes.update(value => value + 1);
  }

  reorder(ids: string[]): void {
    if (!this.canEdit()) return;
    const expected = this.order(this.draft!.roomName, this.visibleIds(this.draft!.roomName));
    if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some(id => !expected.includes(id))) return;
    this.draft!.order = [...ids];
    this.changes.update(value => value + 1);
  }

  dirty(): boolean {
    this.changes();
    if (!this.draft) return false;
    const { value, base, order, originalOrder } = this.draft;
    return order.some((id, index) => id !== originalOrder[index]) || order.length !== originalOrder.length
      || Object.keys(value.layouts).length !== Object.keys(base.value.layouts).length
      || Object.keys(value.layouts).some(id => value.layouts[id] !== base.value.layouts[id])
      || JSON.stringify(value.slots) !== JSON.stringify(base.value.slots);
  }

  save(): boolean {
    if (this.dragging() || (this.settingsId() && !this.single()) || !this.canEdit() || !this.store) return false;
    const draft = this.draft!;
    this.saving.set(true);
    try {
      const value = structuredClone(draft.value);
      if (!draft.singleDevice) value.orders[homeCardViewKey(draft.roomName)] = this.order(draft.roomName, this.visibleIds(draft.roomName));
      this.saved = this.store.save(value, draft.base.raw);
      this.cancel();
      return true;
    } catch (error) {
      this.error.set(preferenceError(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  cancel(reason: string | null = null): void {
    this.draft = undefined;
    this.closeSettings();
    this.single.set(false);
    this.editing.set(false);
    this.selectedId.set(null);
    this.dragging.set(false);
    this.generation.update(value => value + 1);
    this.error.set(reason);
    this.changes.update(value => value + 1);
  }

  setActive(active: boolean): void {
    const resuming = active && !this.active();
    this.active.set(active);
    if (!active) this.dragging.set(false);
    if (active) this.refresh(resuming);
  }

  setDragging(dragging: boolean): void {
    if (!dragging || this.canEdit()) this.dragging.set(dragging);
  }

  private canEdit(): boolean {
    if (!this.active() || this.saving()) return false;
    this.refresh();
    return !!this.draft && this.validDraft(this.draft);
  }

  private load(context: DeviceV2AccountContext): void {
    try {
      this.store = new HomeCardPreferencesStore(localStorage, context);
      this.saved = this.store.load();
      this.error.set(null);
    } catch (error) {
      this.saved = undefined;
      this.error.set(preferenceError(error));
    }
  }

  private account(): DeviceV2AccountContext | undefined {
    if (!this.data.auth?.uuid) return undefined;
    try { return captureDeviceV2AccountContext(this.data, API.BASE_URL); }
    catch { return undefined; }
  }

  private validDraft(draft: CardDraft): boolean {
    if (!sameAccount(this.account(), draft.context)) return false;
    if (draft.roomName !== undefined && !Object.hasOwn(this.data.room?.dict ?? {}, draft.roomName)) return false;
    const visible = this.visibleIds(draft.roomName);
    return draft.originalOrder.every(id => visible.includes(id));
  }

  private visibleIds(roomName: string | undefined): string[] {
    const ids: string[] = roomName === undefined ? this.data.device?.list ?? [] : this.data.room?.dict?.[roomName] ?? [];
    const devices = this.data.device?.dict ?? {};
    return ids.filter(id => Object.hasOwn(devices, id) && !devices[id].config?.disabled);
  }

  private fallback(id: string): HomeCardLayout {
    return this.data.device?.dict?.[id]?.config?.card?.layout === 'wide' ? 'wide' : 'standard';
  }
}

function sameAccount(left: DeviceV2AccountContext | undefined, right: DeviceV2AccountContext | undefined): boolean {
  return left?.authority === right?.authority && left?.accountId === right?.accountId && left?.sessionEpoch === right?.sessionEpoch;
}

function sameBinding(left: HomeCardBinding, right: HomeCardBinding): boolean {
  return left.key === right.key && left.kind === right.kind && left.type === right.type
    && (left.mode ?? 'read') === (right.mode ?? 'read');
}

function preferenceError(error: unknown): string {
  if (error instanceof Error && error.message === 'HOME_CARD_PREFERENCES_CONFLICT') {
    return '卡片偏好已在其他窗口修改，请取消后重新编辑。';
  }
  if (error instanceof Error && error.message === 'HOME_CARD_PREFERENCES_WRITE_FAILED') {
    return '卡片未保存，请检查本机存储后重试；本次修改仍保留。';
  }
  return '本机卡片偏好暂不可用，原记录已保留，请稍后重新编辑。';
}
