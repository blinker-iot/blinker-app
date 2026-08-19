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

export interface CurrentUser {
  id: string;
  email: string;
  subscription_plan?: {
    name?: string;
    display_name?: string;
    service_tier?: string;
    status?: string;
    end_date?: string | null;
  } | null;
  entitlement_revision?: number;
  entitlements?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GatewayDevice {
  deviceId: string;
  tenantId: string;
  name: string;
  deviceType: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceListResponse {
  devices: GatewayDevice[];
}

export interface DeviceResponse {
  device: GatewayDevice;
}

export interface DeviceCreateResponse extends DeviceResponse {
  authKey?: string;
  replayed: boolean;
}

export interface DeviceConnectionStatus {
  status: 0 | 1;
  mode: 'mqtt' | 'http' | null;
  lastActiveAt: string | null;
  updatedAt: string | null;
  httpAuthed: boolean;
  httpAuthFresh: boolean;
  httpAuthAt: string | null;
  mqttOnline: boolean;
  mqttConnectedAt: string | null;
  mqttLastSeenAt: string | null;
}

export interface DeviceStatusResponse {
  device: Pick<GatewayDevice, 'deviceId' | 'status'>;
  status: DeviceConnectionStatus;
  brokerStatus: string;
}

export interface DeviceSnapshot {
  protocol: string;
  receivedAt: number;
  sourceClientId: string;
  data: unknown;
  [key: string]: unknown;
}

export interface DeviceDataResponse {
  device: Pick<GatewayDevice, 'deviceId'>;
  data: DeviceSnapshot | null;
}

export interface DeviceConfigResponse {
  config: Record<string, unknown>;
}

export interface MqttConnection {
  host: string;
  port: number;
  protocol: 'mqtt' | 'mqtts';
  clientId: string;
  username: string;
  password: string;
  expiresIn: number;
  credentialProfile?: string;
  keepalive: number;
  clean: boolean;
}

export interface AccountConnectionResponse {
  account: { accountId: string; tenantId: string };
  mqtt: MqttConnection;
  shard: { shard_id: number; route_version: number };
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
}

export class GatewayHttpError extends Error implements NormalizedHttpError {
  readonly httpStatus: number;
  readonly code: string;
  readonly requestId?: string;
  readonly data?: unknown;

  constructor(error: NormalizedHttpError) {
    super(error.message);
    this.name = 'GatewayHttpError';
    this.httpStatus = error.httpStatus;
    this.code = error.code;
    this.requestId = error.requestId;
    this.data = error.data;
  }
}
