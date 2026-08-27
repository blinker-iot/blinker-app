export interface BlinkerResponse {
  message: number;
  detail: any;
}

export interface AilyResponse<T> {
  status: number;
  data: T;
  messages?: string | null;
  errorCode?: string | number | null;
  errorArgs?: Record<string, unknown>;
  errorMessage?: string | null;
}

export interface AltchaChallenge {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface AuthTokenResponseData {
  access_token: string;
  refresh_token: string;
  token_type?: string;
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

export interface CurrentUser {
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

export interface AccountDeletionCodeData {
  purpose: 'account_deletion';
  expiresIn: number;
  maskedEmail: string;
}

export interface DeviceKeyContext {
  logicalDeviceId: string;
  credentialVersion: number;
  locator: string;
}

export interface DeviceV2PresenceMetadata {
  cloudReachable?: boolean | null;
  cloudLastSeenAt?: number | null;
  manifestRevision?: number | null;
  manifestFingerprint?: string | null;
  manifestUpdatedAt?: number | null;
}

export interface DeviceKeyLogicalDevice extends DeviceKeyContext, DeviceV2PresenceMetadata {
  tenantId: string;
  name: string;
  deviceType: string;
  state: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceKeyCreateResponse {
  status: number;
  data: {
    device: DeviceKeyLogicalDevice;
    replayed: boolean;
  };
}

export interface DeviceKeyRevealData extends DeviceKeyContext {
  deviceKey: string;
}

export interface DeviceKeyRevealResponse {
  status: number;
  data: DeviceKeyRevealData;
}

export interface DeviceKeyRotateData extends DeviceKeyContext {
  deviceKey: string;
}

export interface DeviceKeyRotateResponse {
  status: number;
  data: DeviceKeyRotateData;
}

export interface MqttConnection {
  host: string;
  port: number;
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss';
  url?: string;
  path?: string;
  clientId: string;
  username: string;
  password: string;
  expiresIn: number;
  credentialProfile?: string;
  publishTopic: string;
  subscribeTopic: string;
  keepalive: number;
  clean: boolean;
}

export interface AccountConnectionResponse {
  account: { accountId: string; tenantId: string };
  mqtt: MqttConnection;
  wire: 'bbp2';
  protocolVersion: 2;
  transport: 'tcp' | 'websocket';
  shard: { shard_id: number; route_version: number };
}

export interface DeviceKeyListResponse {
  status: number;
  data: { devices: DeviceKeyLogicalDevice[] };
}

export type DeviceV2ShareRole = 'viewer' | 'operator';

export interface DeviceV2ShareGrant {
  shareId: string;
  role: DeviceV2ShareRole;
  commandEndpointKeys: string[] | null;
  version: number;
  state: 'active' | 'revoked';
  createdAt: number;
  updatedAt: number;
  revokedAt: number | null;
  memberRef?: string;
}

export interface DeviceV2ShareInvitation {
  invitationId: string;
  invitationCode?: string;
  role: DeviceV2ShareRole;
  commandEndpointKeys: string[] | null;
  state: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: number;
  replayed?: boolean;
}

export interface DeviceV2OwnerShares {
  logicalDeviceId: string;
  shares: DeviceV2ShareGrant[];
  invitations: DeviceV2ShareInvitation[];
}

export interface DeviceV2ReceivedDevice extends DeviceV2PresenceMetadata {
  logicalDeviceId: string;
  tenantId: string;
  name: string;
  deviceType: string;
  share: DeviceV2ShareGrant;
}

export interface DeviceV2ReceivedSharesResponse {
  status: number;
  data: { devices: DeviceV2ReceivedDevice[] };
}

export interface FeedbackSubmitData {
  feedbackId: string | number;
  issueStatus?: string;
  [key: string]: unknown;
}

export interface FeedbackSubmitResponse {
  status: number;
  data: FeedbackSubmitData;
  messages?: string | null;
}

export interface FeedbackUploadResponse {
  status: number;
  data: {
    url: string;
    path: string;
    size: number;
    content_type: string;
  };
  messages?: string | null;
}

export interface DeletedAccountResponse {
  account: {
    accountId: string;
    tenantId: string;
    status: 'deleted';
    deletedAt: number;
  };
}

export interface NormalizedHttpError {
  httpStatus: number;
  code: string;
  message: string;
  requestId?: string;
  data?: unknown;
  retryAfterSeconds?: number;
}

export class GatewayHttpError extends Error implements NormalizedHttpError {
  readonly httpStatus: number;
  readonly code: string;
  readonly requestId?: string;
  readonly data?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(error: NormalizedHttpError) {
    super(error.message);
    this.name = 'GatewayHttpError';
    this.httpStatus = error.httpStatus;
    this.code = error.code;
    this.requestId = error.requestId;
    this.data = error.data;
    this.retryAfterSeconds = error.retryAfterSeconds;
  }
}
