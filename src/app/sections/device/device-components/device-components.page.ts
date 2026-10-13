import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { API } from '../../../configs/api.config';
import { assertDeviceV2AccountContext, captureDeviceV2AccountContext } from '../../../core/device-v2/account-scope';
import { DeviceUiConnection, DeviceUiPort, DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import {
  generateDefaultPageLayout, isExtraReading, migratePageLayout, PageLayout, PageLayoutWidget, reflowPageWidgets,
} from '../../../core/device-v2/page-layout';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import { BlinkerDevice } from '../../../core/model/device.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceService } from '../../../core/services/device.service';
import { DeviceV2PageLayoutService } from '../../../core/services/device-v2-page-layout.service';
import { readDeviceTheme } from '../../../device/device-theme';
import { PageLayoutPanelComponent, PanelCard } from '../../../device/v2/panel/page-layout-panel';
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';

@Component({
  selector: 'app-device-components',
  standalone: true,
  imports: [IonicModule, PageLayoutPanelComponent, WidgetInspectorComponent],
  templateUrl: './device-components.page.html',
  styleUrls: ['./device-components.page.scss'],
})
export class DeviceComponentsPage implements OnInit, OnDestroy {
  readonly id: string;
  device?: BlinkerDevice;
  snapshot?: DeviceUiSnapshot;
  layout?: PageLayout;
  loading = true;
  saving = false;
  error = '';
  configReady = false;
  // Widget being restyled in the editor, with the layout it belongs to.
  editing?: { widget: PageLayoutWidget; layout: PageLayout; revision: number };

  private connection?: DeviceUiConnection;
  private stateSubscription?: Subscription;
  private readonly subscriptions = new Subscription();
  private destroyed = false;

  constructor(
    route: ActivatedRoute,
    private readonly data: DataService,
    private readonly devices: DeviceService,
    private readonly layouts: DeviceV2PageLayoutService,
    private readonly deviceUi: DeviceUiPort,
    private readonly cd: ChangeDetectorRef,
  ) {
    this.id = route.snapshot.paramMap.get('id') ?? '';
  }

  get rows(): { key: string; title: string; visible: boolean }[] {
    if (!this.snapshot?.manifestAccepted) return [];

    return generateDefaultPageLayout(this.snapshot).widgets.map(widget => ({
      key: widget.endpointKey,
      title: this.layout?.widgets.find(item => item.endpointKey === widget.endpointKey)?.title || widget.title || widget.endpointKey,
      visible: !this.device?.config.hiddenEndpointKeys?.includes(widget.endpointKey),
    }));
  }

  ngOnInit(): void {
    this.subscriptions.add(this.data.deviceDataLoader.subscribe(loaded => {
      if (loaded && !this.device) void this.load();
    }));
  }

  async load(): Promise<void> {
    const device = this.data.getDevice(this.id) as BlinkerDevice | undefined;
    if (!device || device.config.mode !== 'bbp2' || device.config.isShared) {
      this.error = '仅设备所有者可以配置组件。';
      this.loading = false;
      return;
    }

    this.device = device;
    this.loading = true;
    this.configReady = false;
    this.error = '';
    try {
      const context = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      if (!this.connection) {
        this.stateSubscription?.unsubscribe();
        this.stateSubscription = this.deviceUi.watchState(this.id).subscribe(snapshot => {
          this.snapshot = snapshot;
          this.cd.markForCheck();
        });
        this.connection = this.deviceUi.openConnection(this.id);
        void this.connection.ready.catch(() => {
          if (!this.destroyed && !this.snapshot?.manifestAccepted) {
            this.error = '设备能力尚未就绪，请连接设备后重试。';
            this.cd.markForCheck();
          }
        });
      }

      const [config, record] = await Promise.all([
        this.devices.loadDeviceConfig(device),
        this.layouts.get(this.id),
      ]);
      assertDeviceV2AccountContext(this.data, context);
      if (this.destroyed) return;
      if (!config) throw new Error('config-unavailable');

      device.config.hiddenEndpointKeys = config.hiddenEndpointKeys ?? [];
      this.layout = record?.layout;
      this.configReady = true;
    } catch {
      if (!this.destroyed) this.error = '读取组件配置失败，请重试。';
    } finally {
      this.loading = false;
      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  async setVisible(key: string, event: CustomEvent<{ checked: boolean }>): Promise<void> {
    if (this.saving || this.loading || !this.configReady || !this.device || !this.snapshot?.manifestAccepted) return;
    const device = this.device;
    const visible = event.detail.checked;
    const hidden = new Set(device.config.hiddenEndpointKeys ?? []);
    const previouslyVisible = !hidden.has(key);
    if (visible === previouslyVisible) return;

    this.saving = true;
    this.error = '';
    try {
      const context = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      // A newly generated layout may omit hidden fields. Restore their default
      // widget before making them visible again, without changing other widgets.
      if (visible) {
        const record = await this.layouts.get(this.id);
        assertDeviceV2AccountContext(this.data, context);
        if (this.destroyed) return;
        const layout = record
          ? record.manifestFingerprint === this.snapshot.manifestFingerprint
            ? { ...record.layout, widgets: [...record.layout.widgets] }
            : migratePageLayout(record.layout, this.snapshot)
          : generateDefaultPageLayout(this.snapshot);
        if (record && !layout.widgets.some(widget => widget.endpointKey === key)) {
          const widget = generateDefaultPageLayout(this.snapshot).widgets.find(item => item.endpointKey === key);
          if (widget) {
            let widgetId = widget.widgetId;
            while (layout.widgets.some(item => item.widgetId === widgetId)) widgetId += '-restored';
            const y = Math.max(0, ...layout.widgets.map(item => item.grid.y + item.grid.height));
            layout.widgets.push({ ...widget, widgetId, grid: { ...widget.grid, y } });
            const saved = await this.layouts.saveCandidate(this.id, layout, this.snapshot.endpoints, record.revision);
            this.layout = saved.layout;
          }
        }
        hidden.delete(key);
      } else {
        hidden.add(key);
      }

      assertDeviceV2AccountContext(this.data, context);
      if (this.destroyed) return;
      const hiddenEndpointKeys = [...hidden];
      if (!await this.devices.saveDeviceConfig(device, { hiddenEndpointKeys })) throw new Error('save-failed');
      assertDeviceV2AccountContext(this.data, context);
      if (this.destroyed) return;

      device.config.hiddenEndpointKeys = hiddenEndpointKeys;
      device.subject.next({ key: 'hiddenEndpointKeys', value: hiddenEndpointKeys, source: 'component-settings' });
    } catch {
      (event.target as HTMLIonToggleElement).checked = previouslyVisible;
      if (!this.destroyed) this.error = '保存失败，开关已恢复。请重试。';
    } finally {
      this.saving = false;
      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  get theme(): UiTheme {
    return readDeviceTheme(this.id) ?? this.layout?.style ?? 'natural';
  }

  // Fields the edited widget may show as extra readings, named as on the device page.
  get extraCandidates() {
    return (this.snapshot?.endpoints ?? []).filter(endpoint => isExtraReading(endpoint)).map(endpoint => ({
      key: endpoint.key,
      role: endpoint.role, valueType: endpoint.valueType,
      label: this.layout?.widgets.find(widget => widget.endpointKey === endpoint.key)?.title || endpoint.key,
    }));
  }

  // One-card preview of the widget being edited, with the device's current value.
  get previewCards(): PanelCard[] {
    const widget = this.editing?.widget;
    const field = widget && this.snapshot?.endpoints.find(endpoint => endpoint.key === widget.endpointKey);
    if (!widget || !field) return [];
    const extras = widget.extraKeys?.flatMap(key => {
      const extra = this.snapshot?.endpoints.find(endpoint => endpoint.key === key);
      return extra ? [{ field: extra, value: extra.value }] : [];
    });
    return [{ widget: { ...widget, grid: { ...widget.grid, x: 0, y: 0 } }, field, value: field.value, extras,
      display: String(field.value ?? '—'), draft: '', error: '', disabled: false }];
  }

  async openStyle(key: string): Promise<void> {
    if (this.saving || !this.snapshot?.manifestAccepted) return;
    this.error = '';
    try {
      const context = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      const { layout, revision } = await this.editableLayout();
      assertDeviceV2AccountContext(this.data, context);
      const widget = layout.widgets.find(item => item.endpointKey === key);
      if (!this.destroyed && widget) this.editing = { widget, layout, revision };
    } catch {
      if (!this.destroyed) this.error = '读取组件布局失败，请重试。';
    } finally {
      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  async saveStyle(): Promise<void> {
    const editing = this.editing;
    if (!editing || this.saving || !this.snapshot?.manifestAccepted) return;
    this.saving = true;
    try {
      const context = captureDeviceV2AccountContext(this.data, API.BASE_URL);
      const widgets = reflowPageWidgets(editing.layout.widgets.map(widget =>
        widget.widgetId === editing.widget.widgetId ? editing.widget : widget));
      const candidate = { ...editing.layout, revision: Math.max(1, editing.revision), widgets };
      const saved = await this.layouts.saveCandidate(this.id, candidate, this.snapshot.endpoints, editing.revision);
      assertDeviceV2AccountContext(this.data, context);
      if (this.destroyed) return;
      this.layout = saved.layout;
      this.editing = undefined;
      // Same signal as Interface Studio: the device page reloads its panel.
      this.device?.subject.next({ key: 'component', value: 'DeviceV2', source: 'component-settings' });
    } catch {
      if (!this.destroyed) this.error = '样式保存失败，请重试。';
    } finally {
      this.saving = false;
      if (!this.destroyed) this.cd.markForCheck();
    }
  }

  // The stored layout for the current Manifest, or a fresh default one.
  private async editableLayout(): Promise<{ layout: PageLayout; revision: number }> {
    const snapshot = this.snapshot!;
    const record = await this.layouts.get(this.id);
    if (!record) return { layout: generateDefaultPageLayout(snapshot), revision: 0 };
    const layout = record.manifestFingerprint === snapshot.manifestFingerprint
      ? record.layout
      : migratePageLayout(record.layout, snapshot);
    return { layout: { ...layout, widgets: [...layout.widgets] }, revision: record.revision };
  }

  ionViewWillEnter(): void {
    if (this.device && !this.loading) void this.load();
  }

  ionViewDidLeave(): void {
    this.connection?.close();
    this.connection = undefined;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscriptions.unsubscribe();
    this.stateSubscription?.unsubscribe();
    this.connection?.close();
  }
}
