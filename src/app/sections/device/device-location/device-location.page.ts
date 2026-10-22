import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { API } from '../../../configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext, DeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { DeviceLocationRecord, ManualDeviceLocation, manualLocationDraft } from '../../../core/device-v2/device-location';
import { DeviceUiPort } from '../../../core/device-v2/device-ui.port';
import { deviceDisplayName } from '../../../core/device-v2/display-metadata';
import { LocationMapComponent, Wgs84MapPoint } from '../../../core/components/location-map/location-map.component';
import { GatewayHttpError } from '../../../core/model/response.model';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2LocationService } from '../../../core/services/device-v2-location.service';
import { PhoneLocationError, PhoneLocationService } from '../../../core/services/phone-location.service';
import { HomeCardPreferencesStore } from '../../../home/device-card-preferences';
import { deviceCardMetrics } from '../../../home/components/deviceblock/device-card-presentation';

@Component({
  selector: 'app-device-location', templateUrl: './device-location.page.html', styleUrls: ['./device-location.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, LocationMapComponent, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
})
export class DeviceLocationPage implements OnDestroy {
  id = '';
  state: 'unavailable' | 'shared' | 'owner' = 'unavailable';
  message = '请从设备列表重新进入。';
  record: DeviceLocationRecord | null = null;
  longitude = ''; latitude = '';
  busy: 'read' | 'write' | null = null;
  fresh = false; reviewRequired = false;
  error = ''; notice = '';
  editing = false; locating = false; clearPrompt = false; viewingSaved = false;
  locationError = '';
  draftPoint: Wgs84MapPoint | null = null;
  summary: { label: string; value: string }[] = [];
  summaryStale = false;
  private dirty = false;
  private uncertain = false;
  private knownRevision?: number;
  private account?: DeviceV2AccountContext;
  private visible = false;
  private destroyed = false;
  private generation = 0;
  private controller?: AbortController;
  private positionController?: AbortController;
  private stateSubscription?: Subscription;
  private readonly subscriptions = new Subscription();

  constructor(private readonly route: ActivatedRoute, private readonly data: DataService,
    private readonly locations: DeviceV2LocationService, private readonly visibility: AppVisibilityService,
    private readonly cd: ChangeDetectorRef, private readonly phoneLocation: PhoneLocationService,
    private readonly deviceUi: DeviceUiPort) {
    this.subscriptions.add(data.authDataChanged.subscribe(() => this.syncAccess()));
    this.subscriptions.add(data.deviceDataLoader.subscribe(() => this.syncAccess()));
    this.subscriptions.add(visibility.active.subscribe(active => {
      if (!this.visible) return;
      if (!active) {
        // A system permission sheet also pauses Android. Keep the original
        // one-shot GPS owner; only an active, unchanged page may accept it.
        this.cancelHttp(); this.stopSummary(); this.record = null; this.fresh = false; this.mark();
      }
      else if (this.syncAccess()) { this.observeSummary(); void this.reload(); }
    }));
  }

  get defaultBackHref(): string { return this.state === 'unavailable' ? '/home/device' : `/device-manager/${this.id}`; }
  get present(): boolean {
    return this.visible && !this.destroyed && this.visibility.active.value && this.accountCurrent() && this.ownerAvailable();
  }
  get canQuery(): boolean { return this.present && this.state === 'owner'; }
  get canMutate(): boolean {
    return this.canQuery && !this.busy && this.fresh && !this.reviewRequired
      && !!this.record && this.record.revision < 0x7fffffff;
  }
  get canSave(): boolean { return this.editing && !this.viewingSaved && !this.locating && this.canMutate && !!manualLocationDraft(this.longitude, this.latitude); }
  get canClear(): boolean { return this.canMutate && !!this.record?.location; }
  get deviceName(): string { return deviceDisplayName(this.data.device?.dict?.[this.id]); }
  get point(): Wgs84MapPoint | null { return this.editing && !this.viewingSaved ? this.draftPoint : this.record?.location ?? null; }

  ionViewWillEnter(): void {
    if (this.destroyed) return;
    this.reset(); this.visible = true;
    this.id = this.route.snapshot.paramMap.get('id') || '';
    try {
      if (!this.data.auth?.uuid) throw Error('LOCATION_ACCOUNT_UNAVAILABLE');
      this.account = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      if (this.syncAccess()) { this.observeSummary(); void this.reload(); }
    } catch { this.invalidate('请先登录，再从有效设备重新进入。'); }
  }
  ionViewWillLeave(): void { this.visible = false; this.reset(); }
  ngOnDestroy(): void { this.destroyed = true; this.subscriptions.unsubscribe(); this.ionViewWillLeave(); }

  edit(field: 'longitude' | 'latitude', value: string): void {
    if (!this.canQuery || this.busy || !this.editing) return;
    this.cancelPosition();
    this[field] = value; this.dirty = true; this.notice = ''; this.locationError = ''; this.viewingSaved = false;
    const point = manualLocationDraft(this.longitude, this.latitude);
    if (point) this.draftPoint = point;
    this.mark();
  }

  startEditing(): void {
    if (!this.canMutate || !this.record) return;
    this.editing = true; this.viewingSaved = false; this.clearPrompt = false; this.notice = ''; this.locationError = '';
    this.useRecord(this.record);
    this.mark();
    if (!this.record.location) void this.locate();
  }
  cancelEditing(): void {
    if (this.busy) return;
    this.cancelPosition(); this.editing = false; this.viewingSaved = false; this.clearPrompt = false; this.locationError = '';
    if (this.record) this.useRecord(this.record);
    else { this.longitude = ''; this.latitude = ''; this.draftPoint = null; this.dirty = false; }
    this.mark();
  }
  selectPoint(point: Wgs84MapPoint): void {
    if (!this.canQuery || this.busy || !this.editing || this.viewingSaved || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)
      || Math.abs(point.longitude) > 180 || Math.abs(point.latitude) > 90) return;
    this.cancelPosition(); this.setPoint(point); this.mark();
  }
  async locate(): Promise<void> {
    if (!this.canQuery || this.busy || !this.editing || this.locating) return;
    const controller = this.positionController = new AbortController();
    this.locating = true; this.locationError = ''; this.mark();
    try {
      const point = await this.phoneLocation.current(controller.signal);
      if (this.canQuery && this.editing && this.positionController === controller && !controller.signal.aborted) this.setPoint(point);
    } catch (error) {
      if (this.canQuery && this.positionController === controller && !controller.signal.aborted) {
        this.locationError = error instanceof PhoneLocationError ? error.message : '暂时无法定位，可在地图上选点。';
      }
    } finally {
      if (this.positionController === controller) {
        this.positionController = undefined; this.locating = false;
        if (!this.visibility.active.value) this.locationError = '定位未完成，可点选地图或重新定位。';
        this.mark();
      }
    }
  }
  private setPoint(point: Wgs84MapPoint): void {
    this.viewingSaved = false;
    this.longitude = point.longitude.toFixed(6); this.latitude = point.latitude.toFixed(6);
    this.draftPoint = manualLocationDraft(this.longitude, this.latitude);
    this.dirty = true; this.notice = ''; this.locationError = '';
  }

  async reload(): Promise<void> {
    if (!this.canQuery || this.busy) return;
    const needsReview = this.dirty || this.uncertain || this.reviewRequired;
    const previousRevision = this.knownRevision;
    const request = this.begin('read'); this.fresh = false;
    try {
      const record = await this.locations.read(this.id, request.controller.signal);
      if (!this.current(request)) return;
      this.record = record; this.fresh = true; this.knownRevision = record.revision;
      this.reviewRequired = needsReview || (this.editing && previousRevision !== undefined && previousRevision !== record.revision);
      if (!this.dirty) this.useRecord(record);
      this.notice = this.reviewRequired ? '已取得最新位置，选点已保留。' : '';
    } catch (error) {
      if (!this.current(request)) return;
      this.record = null; this.fresh = false;
      this.fail(error, false);
    } finally { this.finish(request); }
  }

  review(): void {
    if (!this.canQuery || this.busy || !this.fresh || !this.record) return;
    this.reviewRequired = false; this.uncertain = false; this.viewingSaved = false;
    this.notice = '选点尚未保存。'; this.mark();
  }
  save(): Promise<void> {
    const location = manualLocationDraft(this.longitude, this.latitude);
    return this.canSave && location ? this.write(location) : Promise.resolve();
  }
  clearLocation(): Promise<void> { return this.canClear ? this.write(null) : Promise.resolve(); }

  private async write(location: ManualDeviceLocation | null): Promise<void> {
    if (!this.canMutate || !this.record) return;
    const input = { expectedRevision: this.record.revision, location };
    const request = this.begin('write'); this.fresh = false; this.uncertain = true;
    try {
      const record = await this.locations.save(this.id, input, request.controller.signal);
      if (!this.current(request)) return;
      this.record = record; this.fresh = true; this.knownRevision = record.revision; this.reviewRequired = false; this.uncertain = false;
      this.cancelPosition(); this.editing = false; this.clearPrompt = false;
      this.useRecord(record); this.notice = location ? '位置已保存' : '位置已移除';
    } catch (error) {
      if (this.current(request)) this.fail(error, true);
    } finally { this.finish(request); }
  }

  private fail(error: unknown, write: boolean): void {
    if (error instanceof GatewayHttpError && (error.httpStatus === 403 || (error.httpStatus === 404
      && ['DEVICE_V2_LOCATION_NOT_FOUND', 'DEVICE_V2_DEVICE_NOT_FOUND'].includes(error.code)))) {
      this.invalidate('设备不可用或无位置访问权限。'); return;
    }
    this.reviewRequired = write || this.reviewRequired;
    this.error = error instanceof GatewayHttpError && error.httpStatus === 404
      ? '位置服务暂不可用，选点已保留。'
      : error instanceof GatewayHttpError && error.httpStatus === 401
      ? '请重新登录后再试。'
      : error instanceof GatewayHttpError && error.code === 'DEVICE_V2_LOCATION_CONFLICT'
        ? '位置已被更新，请查看最新位置后确认选点。'
        : write ? '保存结果尚未确认，请先查看最新位置。'
          : '位置加载失败，请重试。';
  }

  private syncAccess(): boolean {
    if (!this.visible || this.destroyed || !this.account) return false;
    if (!this.accountCurrent()) { this.invalidate('登录状态或服务环境已变化，请从设备列表重新进入。'); return false; }
    const device = this.data.device?.dict?.[this.id];
    if (!device || device.config?.mode !== 'bbp2' || device.config.disabled || device.config.isPreview
      || (device.state !== undefined && device.state !== 'active')) {
      this.invalidate('设备不存在、已停用或当前不可访问，请返回设备列表。'); return false;
    }
    if (device.config.isShared !== false) {
      const shared = device.config.isShared === true;
      this.invalidate(shared ? '分享用户无权读取或设置设备地理位置。' : '当前设备的所有者权限尚未确认。');
      if (shared) this.state = 'shared'; this.mark(); return false;
    }
    this.state = 'owner'; this.mark(); return true;
  }
  private ownerAvailable(): boolean {
    const device = this.data.device?.dict?.[this.id];
    return !!device && device.config?.mode === 'bbp2' && device.config.isShared === false
      && !device.config.disabled && !device.config.isPreview && (device.state === undefined || device.state === 'active');
  }
  private accountCurrent(): boolean {
    try {
      if (!this.data.auth?.uuid || !this.account || this.account.authority !== API.BASE_URL) return false;
      assertDeviceV2AccountContext(this.data, this.account); return true;
    } catch { return false; }
  }
  private useRecord(record: DeviceLocationRecord): void {
    this.longitude = record.location === null ? '' : String(record.location.longitude);
    this.latitude = record.location === null ? '' : String(record.location.latitude);
    this.draftPoint = record.location;
    this.dirty = false;
  }
  private observeSummary(): void {
    this.stopSummary();
    if (!this.canQuery || !this.account) return;
    try {
      const bindings = new HomeCardPreferencesStore(localStorage, this.account).load().value.slots[this.id];
      // Observe accepted state only: no connect, query, lease or control demand.
      this.stateSubscription = this.deviceUi.watchState(this.id).subscribe(snapshot => {
        if (!this.canQuery) return;
        this.summaryStale = !snapshot.stateFresh;
        this.summary = deviceCardMetrics(this.data.device.dict[this.id], snapshot, bindings)
          .filter(metric => metric.mode !== 'action').map(metric => ({ label: metric.label, value: `${metric.display}${metric.unit}` }));
        this.mark();
      });
    } catch { this.summary = []; }
  }
  private stopSummary(): void { this.stateSubscription?.unsubscribe(); this.stateSubscription = undefined; this.summary = []; }
  private begin(kind: 'read' | 'write') {
    const request = { generation: ++this.generation, controller: this.controller = new AbortController() };
    this.busy = kind; this.error = ''; this.notice = ''; this.mark(); return request;
  }
  private current(request: { generation: number; controller: AbortController }): boolean {
    return this.canQuery && request.generation === this.generation && request.controller === this.controller && !request.controller.signal.aborted;
  }
  private finish(request: { generation: number; controller: AbortController }): void {
    if (this.current(request)) { this.busy = null; this.controller = undefined; this.mark(); }
  }
  private cancelPosition(): void { this.positionController?.abort(); this.positionController = undefined; this.locating = false; }
  private cancelHttp(): void { ++this.generation; this.controller?.abort(); this.controller = undefined; this.busy = null; }
  private cancel(): void { this.cancelHttp(); this.cancelPosition(); }
  private reset(): void {
    this.cancel(); this.stopSummary(); this.account = undefined; this.record = null; this.fresh = false; this.knownRevision = undefined;
    this.longitude = ''; this.latitude = ''; this.dirty = false; this.uncertain = false;
    this.reviewRequired = false; this.error = ''; this.notice = ''; this.state = 'unavailable'; this.mark();
    this.editing = false; this.locationError = ''; this.draftPoint = null; this.clearPrompt = false; this.viewingSaved = false;
  }
  private invalidate(message: string): void { this.reset(); this.message = message; this.mark(); }
  private mark(): void { if (!this.destroyed) this.cd.markForCheck(); }
}
