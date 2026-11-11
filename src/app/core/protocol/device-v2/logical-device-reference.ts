/** Logical metadata/storage identity only. Opaque Cloud IDs are not BBP peer
 * addresses; callers must not decode them or derive Direct routing from them. */
export function isLogicalDeviceReferenceId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 43) return false;
  if (value.length === 43 && /^device_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) return true;
  const opaque = /^(?:device|ble)_([A-Za-z0-9_-]{21}[AQgw])$/.exec(value);
  // Sixteen bytes have exactly 22 unpadded base64url characters; only four
  // final characters are canonical. The zero identity is never a reference.
  return opaque !== null && opaque[0] === value && opaque[1] !== 'AAAAAAAAAAAAAAAAAAAAAA';
}
