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

export interface GatewayUserProfile {
  id: string;
  email: string;
  subscription_plan?: Record<string, unknown> | null;
  entitlement_revision?: number;
  entitlements?: Record<string, unknown>;
  [key: string]: unknown;
}
