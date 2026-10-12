import { legacyField, readLegacyPanel } from '../../../core/device-v2/legacy-panel';
import { reflowPageWidgets, type PageLayoutWidget } from '../../../core/device-v2/page-layout';
import { fitSize, widgetVariant } from '../../../core/device-v2/page-widget';
import { presetForVariant } from '../../../core/device-v2/widget-presets';
import type { BlinkerDevice } from '../../../core/model/device.model';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { displayValue, type InterfaceTile } from './interface-draft';

// The studio and the device page read the same field declarations and values.
export function legacyPreviewCards(tiles: InterfaceTile[], device: BlinkerDevice): PanelCard[] {
  const panel = readLegacyPanel(device);
  const presets = tiles.map(tile => presetForVariant(widgetVariant(tile.type, tile.variant)));
  const fields = Object.values(panel.bindings).map(binding => legacyField(binding, device));
  const widgets = reflowPageWidgets(tiles.map((tile, index): PageLayoutWidget => ({
    widgetId: tile.id,
    endpointKey: tile.key,
    type: tile.type,
    title: tile.title,
    variant: tile.variant,
    appearance: tile.emphasized ? 'emphasized' : tile.compact ? 'compact' : 'default',
    options: { ...presets[index].options, ...(tile.icon ? { icon: tile.icon } : {}), ...(tile.tone ? { tone: tile.tone } : {}) },
    ...(tile.extras?.length ? { extraKeys: tile.extras.map(extra => extra.key) } : {}),
    grid: { x: 0, y: index, ...fitSize(presets[index].variant, tile.width, tile.height ?? presets[index].height) },
  })));

  return tiles.map((tile, index) => {
    const field = legacyField(panel.bindings[tile.id], device);
    const value = field.value;

    return {
      widget: widgets[index], field, value,
      display: displayValue(value), draft: value == null ? '' : String(value),
      extras: tile.extras?.flatMap(extra => {
        const field = fields.find(candidate => candidate.key === extra.key);

        return field ? [{ field, value: field.value }] : [];
      }),
      error: '', disabled: false,
    };
  });
}
