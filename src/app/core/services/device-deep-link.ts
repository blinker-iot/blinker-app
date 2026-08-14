const DEVICE_DEEP_LINK_PROTOCOL = 'diandeng:';
const DEVICE_DEEP_LINK_HOST = 'device';
const LEGACY_DEVICE_ROUTE = /^\/device\/([^/?#]+)\/?(?:[?#].*)?$/;

export function createDeviceDeepLink(deviceId: string): string {
  return `diandeng://device/${encodeURIComponent(deviceId)}`;
}

export function parseDeviceDeepLink(value?: string | null): string | null {
  if (!value) return null;

  const legacyMatch = value.trim().match(LEGACY_DEVICE_ROUTE);
  if (legacyMatch) return decodeDeviceId(legacyMatch[1]);

  try {
    const url = new URL(value);
    if (
      url.protocol !== DEVICE_DEEP_LINK_PROTOCOL ||
      url.hostname !== DEVICE_DEEP_LINK_HOST
    ) {
      return null;
    }

    const pathSegments = url.pathname.split('/').filter(Boolean);
    return pathSegments.length === 1 ? decodeDeviceId(pathSegments[0]) : null;
  } catch {
    return null;
  }
}

export function parseShortcutDeviceId(
  data?: string | null,
  shortcutId?: string | null,
): string | null {
  const deepLinkDeviceId = parseDeviceDeepLink(data);
  if (deepLinkDeviceId) return deepLinkDeviceId;

  if (!shortcutId) return null;
  const rawId = shortcutId.startsWith('device:')
    ? shortcutId.slice('device:'.length)
    : shortcutId;
  return normalizeDeviceId(rawId);
}

function decodeDeviceId(value: string): string | null {
  try {
    return normalizeDeviceId(decodeURIComponent(value));
  } catch {
    return null;
  }
}

function normalizeDeviceId(value: string): string | null {
  const id = value.trim();
  if (!id || id.length > 256 || /[/?#]/.test(id)) return null;
  return id;
}
