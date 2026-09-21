// Portable App link, not an arbitrary URL fetcher or an HTTPS landing-page claim.
const CODE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const PREFIX = 'diandeng://share/';

export function parseShareInvitation(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  const input = value.trim();
  const code = input.startsWith(PREFIX) ? input.slice(PREFIX.length) : input;
  return CODE.test(code) ? code : null;
}

export function shareInvitationLink(code: string): string {
  if (!CODE.test(code)) throw new Error('共享邀请码无效');
  return PREFIX + code;
}

// An ID is not a bearer proof. Only the authenticated target may use this
// reference; neither an open-link ID nor a notification grants access.
export function parseShareInvitationId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{21}[AQgw]$/.test(value) ? value : null;
}
