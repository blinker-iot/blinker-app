export interface DeviceV2AccountScope {
  authority: string;
  accountId: string;
}

export interface DeviceV2AccountContext extends DeviceV2AccountScope {
  sessionEpoch: number;
}

export interface DeviceV2AccountSource {
  auth: { uuid?: string } | null;
  user?: { id?: string };
  sessionEpoch: number;
}

export type DeviceV2AccountScopeProvider = () => DeviceV2AccountScope;

// Display caches require a restored authenticated identity, never a stale profile.
export function deviceV2AccountCacheScope(
  source: Pick<DeviceV2AccountSource, 'auth'>,
  authority: string,
): DeviceV2AccountScope | undefined {
  if (!source.auth?.uuid) return undefined;
  try { return validateDeviceV2AccountScope({ authority, accountId: source.auth.uuid }); }
  catch { return undefined; }
}

export function captureDeviceV2AccountContext(
  source: DeviceV2AccountSource,
  authority: string,
): DeviceV2AccountContext {
  const accountId = source.auth?.uuid || source.user?.id;
  const scope = validateDeviceV2AccountScope({ authority, accountId: accountId ?? '' });
  if (!Number.isSafeInteger(source.sessionEpoch) || source.sessionEpoch < 0) {
    throw new Error('DEVICE_V2_ACCOUNT_CONTEXT_INVALID');
  }
  return { ...scope, sessionEpoch: source.sessionEpoch };
}

export function assertDeviceV2AccountContext(
  source: DeviceV2AccountSource,
  expected: DeviceV2AccountContext,
): void {
  const current = captureDeviceV2AccountContext(source, expected.authority);
  if (current.accountId !== expected.accountId
    || current.sessionEpoch !== expected.sessionEpoch) {
    throw new Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
  }
}

export function validateDeviceV2AccountScope(
  value: DeviceV2AccountScope,
): DeviceV2AccountScope {
  if (!bounded(value.authority, 512) || !bounded(value.accountId, 128)) {
    throw new Error('DEVICE_V2_ACCOUNT_SCOPE_INVALID');
  }
  return { authority: value.authority, accountId: value.accountId };
}

export function deviceV2AccountStoragePrefix(
  prefix: string,
  scope: DeviceV2AccountScope,
): string {
  const valid = validateDeviceV2AccountScope(scope);
  return `${prefix}${encodeURIComponent(valid.authority + '\0' + valid.accountId)}:`;
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    && !value.includes('\0');
}
