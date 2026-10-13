import { Injectable } from '@angular/core';
import type { PageLayoutWidget } from '../../../core/device-v2/page-layout';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';

export interface PanelWidgetEditorContext {
  deviceId: string;
  widgetId: string;
  card: PanelCard;
  theme: UiTheme;

  extraCandidates: readonly { key: string; label: string }[];

  readonly error: string;

  preview(widget: PageLayoutWidget): PanelCard;
  save(widget: PageLayoutWidget): Promise<boolean>;
  remove(): Promise<boolean>;
  canLeave(): Promise<boolean>;
}

// The cached panel owns persistence. This context only connects its property
// page to that owner; unsaved property values stay inside the property page.
@Injectable({ providedIn: 'root' })

export class PanelWidgetEditorContextService {
  private readonly contexts = new Map<string, PanelWidgetEditorContext>();

  set(context: PanelWidgetEditorContext): void {
    this.contexts.set(context.deviceId, context);
  }

  get(deviceId: string, widgetId: string): PanelWidgetEditorContext | undefined {
    const context = this.contexts.get(deviceId);

    return context?.widgetId === widgetId ? context : undefined;
  }

  release(context: PanelWidgetEditorContext): void {
    if (this.contexts.get(context.deviceId) === context) this.contexts.delete(context.deviceId);
  }
}
