/** Validate an explicit firmware-provided PoP without trimming or retaining it. */
export function readWiFiProvPoP(value: unknown, required = false): string | undefined {
  if (!required && (value === undefined || value === '')) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')
    || new TextEncoder().encode(value).length > 64) {
    throw Object.assign(Error('WIFIPROV_POP_INVALID'), { code: 'WIFIPROV_POP_INVALID' });
  }
  return value;
}
