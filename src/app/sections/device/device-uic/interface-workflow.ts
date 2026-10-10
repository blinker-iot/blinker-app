import type { DeviceUiSnapshot } from '../../../core/device-v2/device-ui.port';
import type { UiTheme } from '../../../core/device-v2/ui-theme';
import { PAGE_WIDGET_OPTION_RULES, PAGE_WIDGET_TONES, PAGE_WIDGET_TYPES, PAGE_WIDGET_VARIANTS } from '../../../core/device-v2/page-widget';
import { toPageLayout, validateProposal, type InterfaceTile } from './interface-draft';

type WorkflowWidget = {
  id: string; type: InterfaceTile['type']; title: string; width: InterfaceTile['width']; height?: number;
  appearance: string; variant?: string; icon?: string; tone?: string;
};
const WORKFLOW_WIDTHS = [2, 4, 6, 8];

export interface WorkflowPreview {
  image: string;
  review: string;
  passed: boolean;
  issues: { widgetId: string; problem: string; suggestion: string }[];
}

export function workflowManifest(tiles: InterfaceTile[], snapshot: DeviceUiSnapshot) {
  return tiles.map(tile => {
    const field = snapshot.endpoints.find(field => field.key === tile.key);
    if (!field) throw new Error('设备能力已更新，请重新生成');
    // Explicit allow-list: never send live values, device IDs or access credentials.
    const { key, role, valueType, readable, writable, notifies, minimum, maximum, step, maxLength, unit, choices } = field;
    return { id: tile.id, key, role, valueType, readable, writable, notifies, minimum, maximum, step, maxLength, unit, choices };
  });
}

export function validateWorkflowResult(input: unknown, source: InterfaceTile[], snapshot: DeviceUiSnapshot,
  style: UiTheme, round: unknown): ReturnType<typeof validateProposal> & { preview: WorkflowPreview } {
  const data = input as {
    proposal?: { summary: string; widgets: WorkflowWidget[] };
    preview?: { mimeType: string; data: string; width: number; height: number };
    review?: { passed: boolean; summary: string; issues: unknown[] };
  };
  const invalid = () => new Error('生成结果未通过校验，请重新生成');
  if (!data || !data.proposal || !data.review || typeof data.review.passed !== 'boolean'
    || !Array.isArray(data.review.issues) || data.review.passed !== (data.review.issues.length === 0) || typeof data.review.summary !== 'string'
    || data.review.summary.length > 500 || !Number.isInteger(round) || Number(round) < 0 || Number(round) > 3) throw invalid();

  const result = validateWorkflowProposal(data.proposal, source, snapshot, style);

  const issues = data.review.issues as WorkflowPreview['issues'];
  if (issues.length > 24 || issues.some(issue => !issue || typeof issue.widgetId !== 'string'
    || (issue.widgetId && !source.some(tile => tile.id === issue.widgetId))
    || typeof issue.problem !== 'string' || issue.problem.length > 300
    || typeof issue.suggestion !== 'string' || issue.suggestion.length > 300)) throw invalid();
  const preview = data.preview;
  if (data.review.passed && !preview) throw invalid();
  if (preview && (preview.mimeType !== 'image/jpeg' || typeof preview.data !== 'string' || preview.data.length > 2 * 1024 * 1024
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(preview.data) || preview.width !== 390
    || !Number.isInteger(preview.height) || preview.height < 1 || preview.height > 12000)) throw invalid();

  return { ...result, preview: { image: preview ? `data:image/jpeg;base64,${preview.data}` : '',
    review: data.review.summary, passed: data.review.passed, issues } };
}

export function validateWorkflowProposal(input: unknown, source: InterfaceTile[], snapshot: DeviceUiSnapshot, style: UiTheme) {
  const proposal = input as { summary: string; widgets: WorkflowWidget[] };
  const invalid = () => new Error('生成配置未通过校验');
  if (!proposal) throw invalid();
  const widgets = proposal.widgets;
  if (!Array.isArray(widgets) || widgets.length !== source.length || widgets.some(widget => !widget
    || !(PAGE_WIDGET_TYPES as readonly string[]).includes(widget.type)
    || (widget.variant !== undefined && !(PAGE_WIDGET_VARIANTS[widget.type] as readonly string[]).includes(widget.variant))
    || (widget.icon !== undefined && (typeof widget.icon !== 'string' || !validIcon(widget.icon)))
    || (widget.tone !== undefined && !(PAGE_WIDGET_TONES as readonly unknown[]).includes(widget.tone))
    || (widget.height !== undefined && (!Number.isInteger(widget.height) || widget.height < 1 || widget.height > 5))
    || !['default', 'compact', 'emphasized'].includes(widget.appearance))
    || widgets.filter(widget => widget.appearance === 'emphasized').length > 1) throw invalid();

  const result = validateProposal({ summary: proposal.summary, widgets: widgets.map(widget => ({
    ...widget, emphasized: widget.appearance === 'emphasized',
  })) }, source, WORKFLOW_WIDTHS);
  result.tiles = result.tiles.map((tile, index) => ({ ...tile, type: widgets[index].type,
    compact: widgets[index].appearance === 'compact',
    height: widgets[index].height, variant: widgets[index].variant as InterfaceTile['variant'],
    icon: widgets[index].icon, tone: widgets[index].tone as InterfaceTile['tone'] }));
  // The local manifest remains authoritative for all component bindings and permissions.
  toPageLayout(result.tiles, snapshot, 1, style);

  return result;
}

export function workflowProgress(stage: unknown, round: unknown): string {
  const labels: Record<string, string> = { match: '正在识别设备字段并匹配组件', design: '正在设计布局和样式',
    render: '正在生成界面预览图', review: '正在进行视觉审查' };
  const label = typeof stage === 'string' ? labels[stage] : undefined;
  if (!label || !Number.isInteger(round) || Number(round) < 0 || Number(round) > 3) throw new Error('无效的生成进度');
  return `${label}…`;
}

export function draftProposal(tiles: InterfaceTile[], summary: string) {
  return { summary, widgets: tiles.map(tile => ({ id: tile.id, type: tile.type, title: tile.title,
    width: tile.width, appearance: tile.emphasized ? 'emphasized' : tile.compact ? 'compact' : 'default',
    ...(tile.height ? { height: tile.height } : {}), ...(tile.variant ? { variant: tile.variant } : {}),
    ...(tile.icon ? { icon: tile.icon } : {}), ...(tile.tone ? { tone: tile.tone } : {}) })) };
}

function validIcon(icon: string): boolean {
  const rule = PAGE_WIDGET_OPTION_RULES.icon;
  return rule.kind === 'text' && icon.length > 0 && icon.length <= rule.bytes && !!rule.pattern?.test(icon);
}
