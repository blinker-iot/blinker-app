import type { DeviceUiEndpoint } from './device-ui.port';
import { COLOR_MAXIMUM, PAGE_WIDGET_VARIANTS, type PageWidgetType, type PageWidgetVariant } from './page-widget';

// Pure endpoint compatibility shared by layout validation and the preset catalogue.
// Keep it independent of both modules so generation can reuse catalogue defaults.
export function variantsFor(type: PageWidgetType, endpoint: DeviceUiEndpoint): readonly PageWidgetVariant[] {
  const all: readonly PageWidgetVariant[] = PAGE_WIDGET_VARIANTS[type];
  const numeric = endpoint.valueType === 'integer' || endpoint.valueType === 'number';

  if (type === 'switch') {
    return endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'boolean' ? all : [];
  }
  if (type === 'button') {
    if (endpoint.role !== 'action' || !endpoint.writable) return [];
    if (endpoint.valueType === 'boolean' || endpoint.valueType === 'null') return ['action'];
    const choices = endpoint.valueType === 'text' ? endpoint.choices?.length ?? 0 : 0;
    if (!choices) return [];
    return choices === 4 || choices === 5 ? ['keys', 'dpad'] : ['keys'];
  }
  if (type === 'slider') {
    if (!endpoint.writable || !numeric || !Number.isFinite(endpoint.minimum) || !Number.isFinite(endpoint.maximum)) return [];
    // Actions have no state; choose a value in the stepper before sending it.
    if (endpoint.role === 'action') return ['stepper'];
    return endpoint.role === 'property' ? all : [];
  }
  if (type === 'select') return endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'text'
    && !!endpoint.choices?.length ? all : [];
  if (type === 'color') return endpoint.role === 'property' && endpoint.writable && endpoint.valueType === 'integer'
    && endpoint.minimum === 0 && endpoint.maximum === COLOR_MAXIMUM ? all : [];
  if (type === 'input') return endpoint.writable && (numeric || endpoint.valueType === 'text') ? all : [];

  if (!endpoint.readable && !endpoint.notifies && endpoint.role !== 'event') return [];
  const displayVariants = all.filter(variant => !['uptime', 'memory'].includes(variant)
    || (endpoint.role === 'property' && numeric));
  // An event is an occurrence: status shows when it last happened.
  return endpoint.role === 'event' ? ['status', ...displayVariants.filter(variant => variant !== 'status')] : displayVariants;
}
