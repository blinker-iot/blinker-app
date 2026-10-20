import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import {
  MAX_EXTRA_KEYS, PAGE_WIDGET_OPTION_RULES, PAGE_WIDGET_TONES, PAGE_WIDGET_TYPES, PAGE_WIDGET_VARIANTS, PageWidgetVariant,
  VARIANT_SIZES, acceptsExtras, widgetVariant,
} from '../../../core/device-v2/page-widget';
import { variantsFor } from '../../../core/device-v2/page-layout';
import { presetForVariant } from '../../../core/device-v2/widget-presets';
import { toPageLayout, validateProposal, type InterfaceTile } from './interface-draft';

type WorkflowWidget = {
  id: string; type: InterfaceTile['type']; title: string; width: InterfaceTile['width']; height?: number;
  appearance: string; variant?: string; icon?: string; tone?: string;
  // 附属读数: ids of other display components folded into this one's note line.
  extras?: string[];
};
const WORKFLOW_WIDTHS = [2, 4, 8];

export function workflowManifest(tiles: InterfaceTile[], snapshot: DeviceUiSnapshot) {
  return tiles.map(tile => {
    const field = snapshot.endpoints.find(field => field.key === tile.key);
    if (!field) throw new Error('设备能力已更新，请重新生成');
    // Explicit allow-list: never send live values, device IDs or access credentials.
    const { key, role, valueType, readable, writable, notifies, minimum, maximum, step, maxLength, unit, choices } = field;
    return { id: tile.id, key, role, valueType, readable, writable, notifies, minimum, maximum, step, maxLength, unit, choices };
  });
}

export function workflowDefaults(tiles: InterfaceTile[], snapshot: DeviceUiSnapshot) {
  const variants = new Set<PageWidgetVariant>();

  for (const tile of tiles) {
    const field = snapshot.endpoints.find(endpoint => endpoint.key === tile.key);

    if (!field) throw new Error('设备能力已更新，请重新生成');

    for (const type of PAGE_WIDGET_TYPES) {
      for (const variant of variantsFor(type, field)) variants.add(variant);
    }
  }

  return [...variants].map(presetForVariant);
}

export function validateWorkflowResult(input: unknown, source: InterfaceTile[], snapshot: DeviceUiSnapshot,
  style: UiTheme, round: unknown): ReturnType<typeof validateProposal> & { warning?: string } {
  const data = input as {
    proposal?: { summary: string; widgets: WorkflowWidget[] };
    warning?: string;
  };

  if (!data?.proposal || !Number.isInteger(round) || Number(round) < 0 || Number(round) > 1
    || (data.warning !== undefined && (typeof data.warning !== 'string' || data.warning.length > 500))) {
    throw new Error('生成结果未通过校验，请重新生成');
  }

  return { ...validateWorkflowProposal(data.proposal, source, snapshot, style), warning: data.warning };
}

export function validateWorkflowProposal(input: unknown, source: InterfaceTile[], snapshot: DeviceUiSnapshot, style: UiTheme) {
  const proposal = input as { summary: string; widgets: WorkflowWidget[] };
  const invalid = () => new Error('生成配置未通过校验');
  if (!proposal) throw invalid();
  const widgets = proposal.widgets;
  if (!Array.isArray(widgets) || widgets.some(widget => !widget
    || !(PAGE_WIDGET_TYPES as readonly string[]).includes(widget.type)
    || (widget.variant !== undefined && !(PAGE_WIDGET_VARIANTS[widget.type] as readonly string[]).includes(widget.variant))
    || (widget.icon !== undefined && (typeof widget.icon !== 'string' || !validIcon(widget.icon)))
    || (widget.tone !== undefined && !(PAGE_WIDGET_TONES as readonly unknown[]).includes(widget.tone))
    || !sizeFits(widget)
    || !['default', 'compact', 'emphasized'].includes(widget.appearance)
    || !extrasFit(widget, source))
    || widgets.filter(widget => widget.appearance === 'emphasized').length > 1) throw invalid();
  // Every source component appears exactly once: as a widget or as an extra reading.
  const placed = widgets.flatMap(widget => [widget.id, ...widget.extras ?? []]);
  if (placed.length !== source.length || new Set(placed).size !== placed.length
    || placed.some(id => !source.some(tile => tile.id === id))) throw invalid();

  const result = validateProposal({ summary: proposal.summary, widgets: widgets.map(widget => ({
    ...widget, emphasized: widget.appearance === 'emphasized',
  })) }, source, WORKFLOW_WIDTHS);
  result.tiles = result.tiles.map((tile, index) => ({ ...tile, type: widgets[index].type,
    compact: widgets[index].appearance === 'compact',
    height: widgets[index].height, variant: widgets[index].variant as InterfaceTile['variant'],
    icon: widgets[index].icon, tone: widgets[index].tone as InterfaceTile['tone'],
    extras: widgets[index].extras?.map(id => ({ id, key: source.find(item => item.id === id)!.key })) }));
  // The local manifest remains authoritative for all component bindings and permissions.
  toPageLayout(result.tiles, snapshot, 1, style);

  return result;
}

export function workflowProgress(stage: unknown, round: unknown): string {
  if (stage !== 'generate' || round !== 1) throw new Error('无效的生成进度');

  return '正在生成界面…';
}

export function draftProposal(tiles: InterfaceTile[], summary: string) {
  return { summary, widgets: tiles.map(tile => ({ id: tile.id, type: tile.type, title: tile.title,
    width: tile.width, appearance: tile.emphasized ? 'emphasized' : tile.compact ? 'compact' : 'default',
    ...(tile.height ? { height: tile.height } : {}), ...(tile.variant ? { variant: tile.variant } : {}),
    ...(tile.icon ? { icon: tile.icon } : {}), ...(tile.tone ? { tone: tile.tone } : {}),
    ...(tile.extras ? { extras: tile.extras.map(extra => extra.id) } : {}) })) };
}

// Extra readings: up to three other display components, on a number, ring or status card.
function extrasFit(widget: WorkflowWidget, source: InterfaceTile[]): boolean {
  if (widget.extras === undefined) return true;
  return Array.isArray(widget.extras) && widget.extras.length > 0 && widget.extras.length <= MAX_EXTRA_KEYS
    && acceptsExtras(widget.type, widget.variant as PageWidgetVariant | undefined)
    && widget.extras.every(id => source.some(tile => tile.id === id && tile.type === 'value'));
}

// Width and, when given, height must be sizes the widget's variant allows.
function sizeFits(widget: WorkflowWidget): boolean {
  const sizes = VARIANT_SIZES[widgetVariant(widget.type, widget.variant as PageWidgetVariant | undefined)];
  return sizes.widths.includes(widget.width) && (widget.height === undefined || sizes.heights.includes(widget.height));
}

function validIcon(icon: string): boolean {
  const rule = PAGE_WIDGET_OPTION_RULES.icon;
  return rule.kind === 'text' && icon.length > 0 && icon.length <= rule.bytes && !!rule.pattern?.test(icon);
}
