export interface AilyEnvelope<T> {
  status: number;
  data: T;
  messages?: string | null;
  errorCode?: string | number | null;
  errorMessage?: string | null;
  [key: string]: unknown;
}

export interface GatewayTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expiresIn?: number;
}

export interface GatewayTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
}

export interface GatewaySubscriptionPlan {
  name: string;
  display_name: string;
  service_tier: string;
  subscription_id: string | null;
  status: string;
  end_date: string | null;
  [key: string]: unknown;
}

export type GatewayEntitlements = Record<string, boolean | number>;

export interface GatewayUserProfile {
  id: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  avatar: string | null;
  subscription_plan: GatewaySubscriptionPlan | null;
  permissions: string[];
  rbac_permissions: string[];
  entitlement_revision?: number;
  entitlements: GatewayEntitlements;
  [key: string]: unknown;
}
