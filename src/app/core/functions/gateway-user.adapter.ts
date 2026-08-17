import { UserData } from '../model/data.model';
import {
  GatewayEntitlements,
  GatewaySubscriptionPlan,
  GatewayUserProfile,
} from '../model/gateway.model';

export type GatewayUserData = UserData & {
  id: string;
  nickname: string | null;
  email: string;
  subscriptionPlan: GatewaySubscriptionPlan | null;
  permissions: string[];
  rbacPermissions: string[];
  entitlementRevision?: number;
  entitlements: GatewayEntitlements;
};

export function mapGatewayUser(profile: GatewayUserProfile): GatewayUserData {
  return {
    id: profile.id,
    nickname: profile.nickname,
    email: profile.email,
    username: profile.nickname?.trim() || profile.email,
    avatar: profile.avatar ?? '',
    phone: profile.phone ?? '',
    level: 0,
    subscriptionPlan: profile.subscription_plan,
    permissions: profile.permissions,
    rbacPermissions: profile.rbac_permissions,
    entitlementRevision: profile.entitlement_revision,
    entitlements: profile.entitlements,
  };
}
