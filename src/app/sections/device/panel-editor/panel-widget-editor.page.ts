import { ChangeDetectionStrategy, Component, HostBinding } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LegacyPanelSizingDirective } from '../../../core/directives/legacy-panel-sizing.directive';

import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import { PageWidgetComponent } from '../../../device/v2/panel/page-widget';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';
import { PanelWidgetEditorContext, PanelWidgetEditorContextService } from './panel-widget-editor-context.service';

@Component({
  selector: 'app-panel-widget-editor',
  standalone: true,
  imports: [
    LegacyPanelSizingDirective,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSpinner,
    IonTitle,
    IonToolbar,
    PageWidgetComponent,
    WidgetInspectorComponent,
  ],
  templateUrl: './panel-widget-editor.page.html',
  styleUrls: ['./panel-widget-editor.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})

export class PanelWidgetEditorPage {
  readonly deviceId: string;
  readonly widgetId: string;
  readonly editorUrl: string;
  context?: PanelWidgetEditorContext;
  widget?: PageLayoutWidget;

  saving = false;
  invalid = false;
  draftVersion = 0;
  error = '';

  constructor(route: ActivatedRoute, private readonly nav: NavController,
    private readonly contexts: PanelWidgetEditorContextService) {
    this.deviceId = route.snapshot.paramMap.get('id') || '';
    this.widgetId = route.snapshot.paramMap.get('widgetId') || '';
    this.editorUrl = `/device/${encodeURIComponent(this.deviceId)}/edit`;
  }

  @HostBinding('attr.data-ui-theme') get theme() { return this.context?.theme ?? 'natural'; }

  get card(): PanelCard | undefined {
    return this.context && this.widget ? this.context.preview(this.widget) : undefined;
  }

  ionViewWillEnter(): void {
    this.context = this.contexts.get(this.deviceId, this.widgetId);
    this.widget = this.context ? structuredClone(this.context.card.widget) : undefined;
    this.invalid = false;
    this.draftVersion++;
    this.error = '';

    if (!this.context) void this.nav.navigateBack(this.editorUrl, { replaceUrl: true });
  }

  updateWidget(widget: PageLayoutWidget): void {
    if (this.saving) return;

    this.widget = widget;
    this.error = '';
  }

  setInvalid(invalid: boolean): void {
    if (!this.saving) this.invalid = invalid;
  }

  async save(): Promise<void> {
    if (!this.context || !this.widget || this.saving || this.invalid) return;

    await this.submit(() => this.context!.save(this.widget!));
  }

  async remove(): Promise<void> {
    if (!this.context || this.saving) return;

    await this.submit(() => this.context!.remove());
  }

  async canDeactivate(nextUrl?: string): Promise<boolean> {
    if (this.saving) return false;
    if (nextUrl?.split('?')[0] === this.editorUrl) return true;

    return this.context ? this.context.canLeave() : true;
  }

  private async submit(action: () => Promise<boolean>): Promise<void> {
    this.saving = true;
    this.error = '';

    try {
      if (!await action()) {
        this.error = this.context?.error || '保存失败，请重试。';

        return;
      }

      this.saving = false;

      await this.nav.navigateBack(this.editorUrl);
    } catch {
      this.error = '保存失败，请重试。';
    } finally {
      this.saving = false;
    }
  }
}
