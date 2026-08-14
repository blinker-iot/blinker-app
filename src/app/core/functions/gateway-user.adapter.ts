import { UserData } from '../model/data.model';
import { GatewayUserProfile } from '../model/gateway.model';

export type GatewayUserData = UserData & {
  id: string;
  email: string;
  subscriptionPlan?: Record<string, unknown> | null;
  entitlementRevision?: number;
  entitlements?: Record<string, unknown>;
};

export function mapGatewayUser(profile: GatewayUserProfile): GatewayUserData {
  return {
    id: profile.id,
    email: profile.email,
    username: profile.email,
    avatar: '',
    phone: '',
    level: 0,
    subscriptionPlan: profile.subscription_plan,
    entitlementRevision: profile.entitlement_revision,
    entitlements: profile.entitlements,
  };
}
