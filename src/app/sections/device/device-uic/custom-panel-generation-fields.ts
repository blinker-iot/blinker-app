import type { DeviceUiEndpoint } from '../../../core/device-v2/device-ui.port';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';

type CustomPanelGenerationField = Pick<DeviceUiEndpoint,
  'id' | 'key' | 'role' | 'valueType' | 'readable' | 'writable' | 'notifies' |
  'minimum' | 'maximum' | 'step' | 'maxLength' | 'unit' | 'choices' | 'telemetryMinimumIntervalMs'> & { label: string };

/** The HTML generation wire contract, not the full App endpoint or its readings. */
export function customPanelGenerationFields(cards: readonly PanelCard[]): CustomPanelGenerationField[] {
  const unique = new Map(cards.map(card => [card.field.key, card]));

  return [...unique.values()].map(({ field, widget }) => ({
    id: field.id,
    key: field.key,
    label: widget.title || field.key,
    role: field.role,
    valueType: field.valueType,
    readable: field.readable,
    writable: field.writable,
    notifies: field.notifies,
    ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
    ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
    ...(field.step !== undefined ? { step: field.step } : {}),
    ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
    ...(field.unit !== undefined ? { unit: field.unit } : {}),
    ...(field.choices !== undefined ? { choices: [...field.choices] } : {}),
    ...(field.telemetryMinimumIntervalMs !== undefined ? { telemetryMinimumIntervalMs: field.telemetryMinimumIntervalMs } : {}),
  }));
}
