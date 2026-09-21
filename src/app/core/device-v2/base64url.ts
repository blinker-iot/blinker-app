export function base64UrlEncode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string, expectedSize?: number): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('DEVICE_V2_BASE64URL_INVALID');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); }
  catch { throw new Error('DEVICE_V2_BASE64URL_INVALID'); }
  const output = Uint8Array.from(binary, character => character.charCodeAt(0));
  if ((expectedSize !== undefined && output.length !== expectedSize)
    || base64UrlEncode(output) !== value || !output.some(byte => byte !== 0)) {
    output.fill(0);
    throw new Error('DEVICE_V2_BASE64URL_INVALID');
  }
  return output;
}
