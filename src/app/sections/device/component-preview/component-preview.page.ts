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
import { WidgetLongPressDirective } from './widget-long-press.directive';

const TICK_MS = 3000;
const HISTORY_LIMIT = 120;

// Component library workbench: every variant under the three themes, each
// editable in the inspector. Actions only change demo state.
@Component({
  selector: 'app-component-preview',
  standalone: true,
  imports: [IonicModule, PageLayoutPanelComponent, WidgetInspectorComponent, WidgetLongPressDirective],
  templateUrl: './component-preview.page.html',
  styleUrls: ['./component-preview.page.scss'],
  host: { '[attr.data-ui-theme]': 'theme' },
})
export class ComponentPreviewPage implements OnDestroy {
  readonly id: string;
  readonly themes = UI_THEMES;
  sections: DemoSection[] = linkExtras(createDemoSections());
  theme: UiTheme;
  selectedId?: string;

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

  // Fields the selected card may show as extra readings: the other display cards.
  get extraCandidates(): { key: string; label: string }[] {
    const selected = this.selected;
    return this.sections.flatMap(section => section.cards)
      .filter(card => card.widget.type === 'value' && card !== selected)
      .map(card => ({ key: card.field.key, label: card.widget.title ?? card.field.key }));
  }

  selectTheme(theme: UiTheme): void {
    this.theme = theme;
  }

  // A tap is the widget's own action; a long press opens its settings.
  select(id: string): void {
    this.selectedId = id;
  }

  // Closing the inspector clears the selection; on phones that hides the sheet.
  closeInspector(): void {
    this.selectedId = undefined;
  }

  // The inspector may change a size, so the section is packed again.
  updateWidget(widget: PageLayoutWidget): void {
    this.sections = linkExtras(this.sections.map(section => {
      if (!section.cards.some(card => card.widget.widgetId === widget.widgetId)) return section;
      const cards = section.cards.map(card => card.widget.widgetId === widget.widgetId ? { ...card, widget } : card);
      const widgets = reflowPageWidgets(cards.map(card => card.widget));
      return { ...section, cards: cards.map((card, index) => ({ ...card, widget: widgets[index] })) };
    }));
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
    this.sections = linkExtras(this.sections.map(section => ({
      ...section,
      cards: section.cards.map(card => card.field.key === key ? change(card) : card),
    })));
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

// Extra readings follow the demo cards they name, so they drift with them.
function linkExtras(sections: DemoSection[]): DemoSection[] {
  const cards = new Map(sections.flatMap(section => section.cards).map(card => [card.field.key, card]));
  return sections.map(section => ({
    ...section,
    cards: section.cards.map(card => {
      const extras = card.widget.extraKeys?.flatMap(key => {
        const source = cards.get(key);
        return source ? [{ field: source.field, value: source.value }] : [];
      });
      return extras ? { ...card, extras } : card;
    }),
  }));
}
