import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { PageLayoutWidget, reflowPageWidgets } from '../../../core/device-v2/page-layout';
import { UI_THEMES, UiTheme } from '../../../core/device-v2/ui-theme';
import { readDeviceTheme } from '../../../device/device-theme';
import { PageLayoutPanelComponent, PanelAction, PanelCard } from '../../../device/v2/panel/page-layout-panel';
import { numeric } from '../../../device/v2/widgets/widget-kit';
import { WidgetInspectorComponent } from '../widget-inspector/widget-inspector';
import { createDemoSections, DemoSection, liveDemo, nextReading } from './component-preview.data';

const TICK_MS = 3000;
const HISTORY_LIMIT = 120;

// Component library workbench: every variant under the three themes, each
// editable in the inspector. Actions only change demo state.
@Component({
  selector: 'app-component-preview',
  standalone: true,
  imports: [IonicModule, PageLayoutPanelComponent, WidgetInspectorComponent],
  templateUrl: './component-preview.page.html',
  styleUrls: ['./component-preview.page.scss'],
  host: { '[attr.data-ui-theme]': 'theme' },
})
export class ComponentPreviewPage implements OnDestroy {
  readonly id: string;
  readonly themes = UI_THEMES;
  sections: DemoSection[] = createDemoSections();
  theme: UiTheme;
  selectedId?: string;
  inspectorOpen = false;

  private readonly timer = setInterval(() => this.tick(), TICK_MS);

  constructor(route: ActivatedRoute, private readonly cd: ChangeDetectorRef) {
    this.id = route.snapshot.paramMap.get('id') ?? '';
    this.theme = readDeviceTheme(this.id) ?? 'natural';
  }

  get count(): number {
    return this.sections.reduce((total, section) => total + section.cards.length, 0);
  }

  get selected(): PanelCard | undefined {
    return this.sections.flatMap(section => section.cards).find(card => card.widget.widgetId === this.selectedId);
  }

  selectTheme(theme: UiTheme): void {
    this.theme = theme;
  }

  pick(event: Event): void {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-widget-id]')?.dataset['widgetId'];
    if (!id) return;
    this.selectedId = id;
    this.inspectorOpen = true;
  }

  // The inspector may change a size, so the section is packed again.
  updateWidget(widget: PageLayoutWidget): void {
    this.sections = this.sections.map(section => {
      if (!section.cards.some(card => card.widget.widgetId === widget.widgetId)) return section;
      const cards = section.cards.map(card => card.widget.widgetId === widget.widgetId ? { ...card, widget } : card);
      const widgets = reflowPageWidgets(cards.map(card => card.widget));
      return { ...section, cards: cards.map((card, index) => ({ ...card, widget: widgets[index] })) };
    });
  }

  onAction(action: PanelAction): void {
    this.updateCard(action.field.key, card => {
      if (action.kind === 'draft') return { ...card, draft: String(action.value ?? '') };
      if (action.kind === 'invoke') return card;
      if (action.kind === 'commit') return this.commitDraft(card);
      return this.withValue(card, action.value ?? null);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private commitDraft(card: PanelCard): PanelCard {
    if (card.field.valueType === 'text') return this.withValue(card, card.draft);
    const value = Number(card.draft);
    if (!card.draft.trim() || !Number.isFinite(value)) return { ...card, error: '请输入有效数值' };
    return this.withValue(card, value);
  }

  private withValue(card: PanelCard, value: PanelCard['value']): PanelCard {
    const history = [...(card.history ?? []), { at: Date.now(), value: value ?? null }].slice(-HISTORY_LIMIT);
    return { ...card, value, display: String(value), error: '', history };
  }

  private updateCard(key: string, change: (card: PanelCard) => PanelCard): void {
    this.sections = this.sections.map(section => ({
      ...section,
      cards: section.cards.map(card => card.field.key === key ? change(card) : card),
    }));
  }

  // Live demo readings drift a little on every tick.
  private tick(): void {
    for (const card of this.sections.flatMap(section => section.cards)) {
      const live = liveDemo(card.field.key);
      const current = numeric(card.value);
      if (live && current !== undefined) this.updateCard(card.field.key, item => this.withValue(item, nextReading(current, live)));
    }
    this.cd.markForCheck();
  }
}
