import type { UserData } from '../../../core/model/data.model';

/** Display the Auth entitlement, not an inferred Free/Pro allowance. */
export function profileEntitlements(user: UserData, ownedDeviceCount: number | null) {
  const plan = user.subscriptionPlan;
  const planName = text(plan?.display_name) || text(plan?.name);
  const limit = user.entitlements?.['iot.devices'];
  return {
    planName,
    pro: text(plan?.name).toLowerCase() === 'pro',
    limit: typeof limit === 'number' && Number.isSafeInteger(limit) && limit >= -1
      ? limit : null,
    used: typeof ownedDeviceCount === 'number'
      && Number.isSafeInteger(ownedDeviceCount) && ownedDeviceCount >= 0
      ? ownedDeviceCount : null,
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
