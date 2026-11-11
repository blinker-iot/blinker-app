import { matchesBlePresenceLocator } from './presence';
import { BleApplicationMode, BleModeProfile, base64UrlDecode, sameBytes } from './wire';

export interface AuthorizedBlePresenceCandidate {
  logicalDeviceId: string;
  deviceInstanceId: Uint8Array;
  accessEpoch: number;
  version: number;
  key: Uint8Array;
  registrationBinding?: { rootBindingId: string; bindingRevision: number; materialOwnerLogicalDeviceId: string };
}

// A physical HMAC observation may have several independently authorized card
// projections. Similar MACs, instances, secrets or root refs do not grant one.
export async function matchAuthorizedBlePresenceRegistrations(profile: BleModeProfile,
  candidates: readonly AuthorizedBlePresenceCandidate[]): Promise<string[]> {
  const matches = await matchAuthorizedBlePresenceCandidates(profile, candidates);
  return [...new Set(matches.map(candidate => candidate.logicalDeviceId))].sort();
}

export async function matchAuthorizedBlePresenceCandidates(profile: BleModeProfile,
  candidates: readonly AuthorizedBlePresenceCandidate[]): Promise<AuthorizedBlePresenceCandidate[]> {
  if (profile.mode !== BleApplicationMode.Direct || profile.wireVersion !== 3) return [];
  const matches: AuthorizedBlePresenceCandidate[] = [];
  for (const candidate of candidates) {
    if (await matchesBlePresenceLocator(candidate.key, {
      deviceInstanceId: candidate.deviceInstanceId, accessEpoch: candidate.accessEpoch,
      presenceKeyVersion: candidate.version,
    }, profile.modeLocator)) matches.push(candidate);
  }
  if (new Set(matches.map(candidate => candidate.logicalDeviceId)).size < 2) return matches;
  const first = matches[0], binding = first.registrationBinding;
  if (!validBinding(binding)) return [];
  for (const candidate of matches) {
    const other = candidate.registrationBinding;
    if (!validBinding(other) || other.rootBindingId !== binding.rootBindingId
      || other.bindingRevision !== binding.bindingRevision
      || other.materialOwnerLogicalDeviceId !== binding.materialOwnerLogicalDeviceId
      || candidate.accessEpoch !== first.accessEpoch || candidate.version !== first.version
      || !sameBytes(candidate.deviceInstanceId, first.deviceInstanceId) || !sameBytes(candidate.key, first.key)) return [];
  }
  return matches;
}

function validBinding(value: AuthorizedBlePresenceCandidate['registrationBinding']): value is NonNullable<typeof value> {
  if (!value || !Number.isSafeInteger(value.bindingRevision) || value.bindingRevision < 1
    || value.bindingRevision > 0xffff_ffff || typeof value.materialOwnerLogicalDeviceId !== 'string'
    || !value.materialOwnerLogicalDeviceId || value.materialOwnerLogicalDeviceId.length > 128) return false;
  try { return base64UrlDecode(value.rootBindingId, 16).some(Boolean); } catch { return false; }
}
