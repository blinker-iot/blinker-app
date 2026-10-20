import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';

import {
  DeviceUiConnectivitySnapshot,
  DeviceUiPort,
  DeviceUiSnapshot,
} from 'src/app/core/device-v2/device-ui.port';

import { BlinkerDevice } from 'src/app/core/model/device.model';
import { deviceDisplayName } from 'src/app/core/device-v2/display-metadata';
import { DeviceCardMetric, deviceCardColumns, deviceCardMetrics, deviceCardRangeFits, homeCardBindingField, homeCardRow } from './device-card-presentation';
import type { HomeCardBinding } from '../../device-card-preferences';
import type { HomeCardControlIntent, HomeCardControlStatus } from '../../device-card-control.models';
import { canWriteDeviceEndpoint, deviceUiRange, validateDeviceUiControlValue } from '../../../core/device-v2/endpoint-control';

type DeviceCardStatus = 'offline' | 'unknown' | 'reachable' | 'ready';
interface RangeInteraction {
  binding: HomeCardBinding;
  fingerprint: string | null;
  revision: number | null;
  start: number;
  value: number;
  source: 'pointer' | 'keyboard' | 'assistive';
  pointerId?: number;
  element?: HTMLInputElement;
}
const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

@Component({
  selector: 'deviceblock',
  templateUrl: 'deviceblock.html',
  styleUrls: ['deviceblock.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BDeviceImgComponent],
})

export class Deviceblock implements AfterViewInit {
  @ViewChild('cardElement') private cardElement?: ElementRef<HTMLElement>;
  private current?: BlinkerDevice;
  private snapshot?: DeviceUiSnapshot;
  private measuredWidth = 0;
  private tileMinimum = 48;
  private resizeObserver?: ResizeObserver;
  private _wide = false;
  private reportedCapacity?: number;
  private reportedRangeFits?: boolean;
  private capacityScheduled = false;
  private destroyed = false;
  private _bindings?: readonly HomeCardBinding[];
  private _editing = false;
  private _controlsEnabled = false;
  private _controlStates: Readonly<Record<string, HomeCardControlStatus>> = {};
  private appActive = true;
  private appActivity?: Subscription;
  private rangeInteraction?: RangeInteraction;
  private lastRangeCommit?: { key: string; value: number; fingerprint: string | null; revision: number | null };
  private discardedRangeChange?: { key: string; value: number };

  private unsubscribe?: () => void;
  private connection?: Subscription;
  private deviceChanges?: Subscription;

  private connectivity: DeviceUiConnectivitySnapshot = {
    activeTransport: 'cloud',
    directConnectAllowed: true,
    bleAccess: null,
    bleAdapterEnabled: null,
    bleState: 'idle',
    cloudSessionState: 'idle',
  };

  @Input()
  set device(device: BlinkerDevice) {
    this.cancelRange();
    this.lastRangeCommit = undefined;
    this.current = device;
    this.snapshot = undefined;

    this.unsubscribe?.();
    this.connection?.unsubscribe();
    this.deviceChanges?.unsubscribe();

    this.connectivity = {
      activeTransport: this.directOnly ? 'ble' : 'cloud',
      directConnectAllowed: true,
      bleAccess: this.directOnly ? true : null,
      bleAdapterEnabled: null,
      bleState: 'idle',
      cloudSessionState: 'idle',
    };

    const id = device?.deviceName;

    if (!id) return;

    this.deviceChanges = device.subject.subscribe(event => {
      if (event.key === 'customName' || event.key === 'image') device.config[event.key] = event.value;

      this.cd.markForCheck();
    });

    const subscription = this.deviceUi.watchState(id).subscribe(snapshot => {
      const interaction = this.rangeInteraction;
      if (interaction && (!snapshot.manifestAccepted || !snapshot.stateFresh
        || snapshot.manifestFingerprint !== interaction.fingerprint || snapshot.stateRevision !== interaction.revision
        || !homeCardBindingField(snapshot, interaction.binding))) this.cancelRange();
      if (this.snapshot?.manifestFingerprint !== snapshot.manifestFingerprint
        || this.snapshot?.stateRevision !== snapshot.stateRevision) this.lastRangeCommit = undefined;
      this.snapshot = snapshot;

      this.cd.markForCheck();
    });

    this.unsubscribe = () => subscription.unsubscribe();

    this.connection = this.deviceUi.watchConnectivity(id).subscribe(state => {
      this.connectivity = state;

      this.cd.markForCheck();
    });
  }

  get device(): BlinkerDevice {
    return this.current as BlinkerDevice;
  }

  @Input()
  set bindings(bindings: readonly HomeCardBinding[] | undefined) {
    if (bindings !== this._bindings) this.cancelRange();
    this._bindings = bindings;
  }
  get bindings(): readonly HomeCardBinding[] | undefined { return this._bindings; }

  @Input()
  set editing(editing: boolean) {
    if (editing) this.cancelRange();
    this._editing = editing;
  }
  get editing(): boolean { return this._editing; }

  @Input()
  set controlsEnabled(enabled: boolean) {
    if (!enabled) this.cancelRange();
    this._controlsEnabled = enabled;
  }
  get controlsEnabled(): boolean { return this._controlsEnabled; }

  @Input()
  set controlStates(states: Readonly<Record<string, HomeCardControlStatus>>) {
    this._controlStates = states;
    const status = this.rangeInteraction && states[this.rangeInteraction.binding.key];
    if (status && (status.busy || status.blocked)) this.cancelRange();
  }
  get controlStates(): Readonly<Record<string, HomeCardControlStatus>> { return this._controlStates; }

  @Output() readonly configure = new EventEmitter<string | undefined>();
  @Output() readonly capacityChange = new EventEmitter<number>();
  @Output() readonly rangeCapacityChange = new EventEmitter<boolean>();
  @Output() readonly control = new EventEmitter<HomeCardControlIntent>();
  @Output() readonly interactionChange = new EventEmitter<boolean>();

  @Input()
  set wide(wide: boolean) {
    if (this._wide !== wide) {
      this.cancelRange();
      this.reportedCapacity = undefined;
      this.reportedRangeFits = undefined;
    }
    this._wide = wide;
    this.scheduleCapacityReport();
  }

  get wide(): boolean { return this._wide; }

  get displayName(): string { return deviceDisplayName(this.current); }

  get canControl(): boolean {
    const routeReady = this.connectivity.activeTransport === 'lan'
      || (this.connectivity.activeTransport === 'ble'
      ? this.connectivity.bleAdapterEnabled !== false && this.connectivity.bleState === 'ready'
      : this.current?.data?.cloudReachable === true
        && this.connectivity.cloudSessionState === 'ready');

    return routeReady
      && this.snapshot?.stateFresh === true;
  }

  get status(): DeviceCardStatus {
    if (this.connectivity.activeTransport === 'lan') return this.canControl ? 'ready' : 'reachable';
    if (this.blePrimary) {
      if (this.connectivity.bleAdapterEnabled === false) return 'offline';
      if (this.connectivity.bleState === 'ready') return 'ready';
      return this.connectivity.bleNearby === true ? 'reachable' : 'unknown';
    }

    if (this.current?.data?.cloudReachable !== true) {
      return this.current?.data?.cloudReachable === false ? 'offline' : 'unknown';
    }

    return this.canControl ? 'ready' : 'reachable';
  }

  get transportIcon(): string {
    if (this.connectivity.activeTransport === 'lan') return 'fa-light fa-network-wired';
    return this.blePrimary ? 'fa-brands fa-bluetooth-b' : 'fa-light fa-wifi';
  }

  get statusText(): string {
    if (this.connectivity.activeTransport === 'lan') return this.canControl ? '局域网已同步' : '局域网已连接';
    if (this.status === 'ready') return this.blePrimary
      ? '蓝牙已连接'
      : '云端已同步';

    if (this.status === 'reachable') {
      if (!this.blePrimary) return '云端在线';
      return '蓝牙在附近';
    }
    if (this.blePrimary) {
      if (this.connectivity.bleAdapterEnabled === false) return '蓝牙不可用';
      if (this.connectivity.bleState === 'scanning') return '正在查找蓝牙';
      if (['connecting', 'retrying'].includes(this.connectivity.bleState)) return '正在连接蓝牙';
      return '蓝牙未发现';
    }
    return this.status === 'unknown' ? '状态未知' : '离线';
  }

  get metrics() { return deviceCardMetrics(this.current, this.snapshot, this.bindings); }

  get columns(): number { return deviceCardColumns(this.measuredWidth, this.wide, this.tileMinimum); }
  get rangeFits(): boolean { return deviceCardRangeFits(this.measuredWidth, this.columns); }

  private get row() {
    const configured = this.bindings ?? this.current?.config.card?.metrics;
    return homeCardRow(this.metrics, this.columns, this.rangeFits, Array.isArray(configured) && configured.length > 4);
  }
  get hasMore(): boolean { return this.row.hasMore; }

  get visibleMetrics() { return this.row.visible; }

  // Distribute multiple visible items without changing measured admission capacity.
  get rowColumns(): number {
    const row = this.row;
    const more = row.hasMore ? 1 : 0;
    return row.visible.length + more >= 2
      ? row.visible.reduce((total, metric) => total + metric.span, more) : this.columns;
  }

  get stale(): boolean { return this.snapshot?.stateFresh !== true; }

  get cachedReadings(): boolean { return this.stale && this.visibleMetrics.some(metric => metric.mode !== 'action' && metric.display !== '—'); }

  configureMetric(event: Event, key?: string): void {
    if (!this.editing) return;
    event.preventDefault();
    event.stopPropagation();
    this.configure.emit(key);
  }

  controlMessage(metric: DeviceCardMetric): string { return metric.unavailable ?? this.controlStates[metric.key]?.message ?? ''; }
  controlFeedback(metric: DeviceCardMetric): string {
    if (metric.unavailable) return '不可用';
    const phase = this.controlStates[metric.key]?.phase;
    return phase === 'connecting' ? '连接中' : phase === 'pending' ? '待确认'
      : phase === 'accepted' ? '已接受' : phase === 'unknown' ? '未确认' : phase === 'rejected' ? '请检查' : '';
  }
  controlDescription(metric: DeviceCardMetric): string {
    const message = this.controlMessage(metric);
    return message ? `${metric.description}；${message}` : metric.description;
  }
  canInteract(metric: DeviceCardMetric): boolean {
    const status = this.controlStates[metric.key];
    return metric.mode !== 'read' && !this.editing && this.controlsEnabled && this.appActive && !metric.unavailable && !!metric.field
      && canWriteDeviceEndpoint(this.current, metric.field) && !status?.busy && !status?.blocked;
  }

  stopControlEvent(event: Event): void { event.preventDefault(); event.stopPropagation(); }

  activateControl(metric: DeviceCardMetric, event: Event): void {
    this.stopControlEvent(event);
    if (this.editing) { this.configure.emit(metric.key); return; }
    if (!this.canInteract(metric)) return;
    this.control.emit({ binding: { ...metric.binding }, manifestFingerprint: this.snapshot?.manifestFingerprint ?? null,
      stateRevision: this.snapshot?.stateRevision ?? null, stateFresh: this.snapshot?.stateFresh === true });
  }

  rangeLimits(metric: DeviceCardMetric) { return metric.field ? deviceUiRange(metric.field) : undefined; }
  rangeReady(metric: DeviceCardMetric): boolean {
    return this.snapshot?.stateFresh === true && this.rangeNumber(metric) !== undefined;
  }
  rangeValue(metric: DeviceCardMetric): number {
    return this.rangeInteraction?.binding.key === metric.key ? this.rangeInteraction.value : this.rangeNumber(metric) ?? 0;
  }
  rangeDisplay(metric: DeviceCardMetric): string { return String(this.rangeValue(metric)); }

  rangePointerStart(metric: DeviceCardMetric, event: PointerEvent): void {
    event.stopPropagation();
    if (event.isPrimary === false || event.button > 0 || !this.startRange(metric, 'pointer', event)) event.preventDefault();
  }

  rangeKeyStart(metric: DeviceCardMetric, event: KeyboardEvent): void {
    event.stopPropagation();
    if (RANGE_KEYS.has(event.key) && !this.startRange(metric, 'keyboard', event)) event.preventDefault();
  }

  rangeInput(metric: DeviceCardMetric, event: Event): void {
    event.stopPropagation();
    this.discardedRangeChange = undefined;
    if (!this.rangeInteraction && !this.startRange(metric, 'assistive', event)) return;
    const value = this.inputValue(metric, event);
    if (this.rangeInteraction?.binding.key === metric.key && value !== undefined) {
      this.rangeInteraction.value = value;
      this.cd.markForCheck();
    }
  }

  rangePointerEnd(metric: DeviceCardMetric, event: PointerEvent): void {
    event.stopPropagation();
    const interaction = this.rangeInteraction;
    if (interaction?.source === 'pointer' && interaction.pointerId === event.pointerId) this.commitRange(metric, event);
  }

  rangeKeyEnd(metric: DeviceCardMetric, event: KeyboardEvent): void {
    event.stopPropagation();
    if (RANGE_KEYS.has(event.key) && this.rangeInteraction?.source === 'keyboard') this.commitRange(metric, event);
  }

  rangeChange(metric: DeviceCardMetric, event: Event): void {
    event.stopPropagation();
    if (this.rangeInteraction && this.rangeInteraction.source !== 'assistive') return;
    const value = this.inputValue(metric, event), last = this.lastRangeCommit;
    if (value === undefined || this.discardedRangeChange?.key === metric.key && this.discardedRangeChange.value === value
      || last && last.key === metric.key && last.value === value
      && last.fingerprint === this.snapshot?.manifestFingerprint && last.revision === this.snapshot?.stateRevision) return;
    if (!this.rangeInteraction && !this.startRange(metric, 'assistive', event)) return;
    this.commitRange(metric, event);
  }

  cancelRange(): void {
    const interaction = this.rangeInteraction;
    if (!interaction) return;
    this.rangeInteraction = undefined;
    this.discardedRangeChange = { key: interaction.binding.key, value: interaction.value };
    if (interaction.pointerId !== undefined && interaction.element?.hasPointerCapture?.(interaction.pointerId)) {
      try { interaction.element.releasePointerCapture(interaction.pointerId); } catch { /* Capture may already be retired. */ }
    }
    this.interactionChange.emit(false);
    this.cd.markForCheck();
  }

  private rangeNumber(metric: DeviceCardMetric): number | undefined {
    if (metric.mode !== 'range' || !metric.field || !this.rangeLimits(metric)) return undefined;
    const value = metric.field.value;
    if (typeof value === 'bigint' && (![1, 2].includes(metric.field.manifestType!)
      || value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER))) return undefined;
    const number = typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : undefined;
    if (number === undefined) return undefined;
    try { validateDeviceUiControlValue(metric.field, number); return number; } catch { return undefined; }
  }

  private inputValue(metric: DeviceCardMetric, event: Event): number | undefined {
    const raw = (event.currentTarget as HTMLInputElement | null)?.value;
    if (!metric.field || typeof raw !== 'string' || !raw.trim()) return undefined;
    const value = Number(raw);
    try { validateDeviceUiControlValue(metric.field, value); return value; } catch { return undefined; }
  }

  private startRange(metric: DeviceCardMetric, source: RangeInteraction['source'], event: Event): boolean {
    if (!this.canInteract(metric) || !this.rangeReady(metric) || !this.rangeFits) return false;
    if (this.rangeInteraction) return this.rangeInteraction.binding.key === metric.key;
    const value = this.rangeNumber(metric)!;
    const element = event.currentTarget as HTMLInputElement | null;
    const pointerId = source === 'pointer' ? (event as PointerEvent).pointerId : undefined;
    this.rangeInteraction = { binding: { ...metric.binding }, fingerprint: this.snapshot?.manifestFingerprint ?? null,
      revision: this.snapshot?.stateRevision ?? null, start: value, value, source, pointerId, element: element ?? undefined };
    this.lastRangeCommit = undefined;
    this.discardedRangeChange = undefined;
    if (pointerId !== undefined) {
      try { element?.setPointerCapture?.(pointerId); } catch { /* Native range handling still owns its input. */ }
    }
    this.interactionChange.emit(true);
    return true;
  }

  private commitRange(metric: DeviceCardMetric, event: Event): void {
    const interaction = this.rangeInteraction, value = this.inputValue(metric, event);
    if (!interaction || interaction.binding.key !== metric.key) return;
    const current = this.canInteract(metric) && this.snapshot?.stateFresh === true
      && interaction.fingerprint === this.snapshot.manifestFingerprint && interaction.revision === this.snapshot.stateRevision;
    this.cancelRange();
    if (!current || value === undefined || value === interaction.start) return;
    this.lastRangeCommit = { key: metric.key, value, fingerprint: interaction.fingerprint, revision: interaction.revision };
    this.control.emit({ binding: interaction.binding, value, manifestFingerprint: interaction.fingerprint,
      stateRevision: interaction.revision, stateFresh: true });
  }

  ngAfterViewInit(): void {
    this.scheduleCapacityReport();
    if (!this.cardElement || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(entries => {
      // The card's border box is the same width used by the footer layout.
      if (this.destroyed || !entries.length || !this.cardElement) return;
      if (!this.measureCard()) return;
      this.scheduleCapacityReport();
      this.cd.markForCheck();
    });
    this.resizeObserver.observe(this.cardElement.nativeElement);
  }

  private measureCard(): boolean {
    if (!this.cardElement) return false;
    const element = this.cardElement.nativeElement;
    const width = element.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) return false;
    const rootFont = Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize);
    const minimum = Number.isFinite(rootFont) ? Math.max(44, rootFont * 3) : 48;
    if (width === this.measuredWidth && minimum === this.tileMinimum) return false;
    this.measuredWidth = width;
    this.tileMinimum = minimum;
    if (!this.rangeFits) this.cancelRange();
    return true;
  }

  private scheduleCapacityReport(): void {
    if (this.capacityScheduled || this.destroyed) return;
    this.capacityScheduled = true;
    queueMicrotask(() => {
      this.capacityScheduled = false;
      if (this.destroyed) return;
      // A size input is applied during change detection; measure after its DOM update.
      if (this.measureCard()) this.cd.markForCheck();
      if (this.columns !== this.reportedCapacity) {
        this.reportedCapacity = this.columns;
        this.capacityChange.emit(this.reportedCapacity);
      }
      if (this.rangeFits !== this.reportedRangeFits) {
        this.reportedRangeFits = this.rangeFits;
        this.rangeCapacityChange.emit(this.reportedRangeFits);
      }
    });
  }

  private get directOnly(): boolean {
    return this.current?.cloudEnabled === false;
  }

  private get blePrimary(): boolean {
    if (this.directOnly) return true;
    if (this.connectivity.bleAccess !== true) return false;
    return this.connectivity.bleAdapterEnabled !== false
      && (this.connectivity.bleNearby === true || this.connectivity.bleState === 'ready');
  }

  constructor(
    private readonly deviceUi: DeviceUiPort,
    private readonly cd: ChangeDetectorRef,
    destroyRef: DestroyRef,
  ) {
    this.appActivity = this.deviceUi.appActive?.subscribe(active => {
      this.appActive = active;
      if (!active) this.cancelRange();
      this.cd.markForCheck();
    });
    destroyRef.onDestroy(() => {
      this.cancelRange();
      this.destroyed = true;
      this.resizeObserver?.disconnect();
      this.unsubscribe?.();
      this.connection?.unsubscribe();
      this.deviceChanges?.unsubscribe();
      this.appActivity?.unsubscribe();
    });
  }
}
