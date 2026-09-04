import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API } from '../../../configs/api.config';
import {
  EdgeGatewayTopologyState,
  isEdgeGatewayTopologyState,
} from '../../protocol/device-v2';
import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';

export interface EdgeGatewayAttachRequest {
  operationId: Uint8Array;
  edgeHubLogicalDeviceId: string;
  childLogicalDeviceId: string;
  childDeviceInstanceId: Uint8Array;
}

export interface EdgeGatewayTopology {
  operationId: Uint8Array;
  edgeHubLogicalDeviceId: string;
  childLogicalDeviceId: string;
  childDeviceInstanceId: Uint8Array;
  accessEpoch: number;
  controllerId: Uint8Array;
  credentialVersion: number;
  presenceKeyVersion: number;
  topologyVersion: number;
  topologyState: EdgeGatewayTopologyState;
  credentialExpiresAt: number;
  deliveryExpiresAt: number;
  edgeHubStored: boolean;
  childInstalled: boolean;
  gatewayProven: boolean;
  updatedAt: number;
  replayed: boolean;
}

export interface EdgeGatewayRelay {
  operation: 1 | 2;
  grantId: Uint8Array;
  controllerId: Uint8Array;
  credentialVersion: number;
  expiresAt: number;
  exactGrant: Uint8Array;
  gatewaySecret: Uint8Array;
}

export interface EdgeGatewayRevocationRecovery {
  operation: 3;
  grantId: Uint8Array;
  controllerId: Uint8Array;
  credentialVersion: number;
  expiresAt: number;
  exactGrant: Uint8Array;
}

export interface EdgeGatewayAttachResult {
  topology: EdgeGatewayTopology;
  relay?: EdgeGatewayRelay;
  recovery?: EdgeGatewayRevocationRecovery;
}

export interface EdgeGatewayAttachApi {
  create(request: EdgeGatewayAttachRequest): Promise<EdgeGatewayAttachResult>;
  get(operationId: Uint8Array): Promise<EdgeGatewayAttachResult>;
  resume(operationId: Uint8Array, controlNonce?: Uint8Array): Promise<EdgeGatewayAttachResult>;
  confirmReceipt(operationId: Uint8Array, receipt: Uint8Array): Promise<EdgeGatewayAttachResult>;
  cancel(operationId: Uint8Array): Promise<EdgeGatewayAttachResult>;
  detach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult>;
  prepareRevocationRecovery(
    operationId: Uint8Array,
    controlNonce: Uint8Array,
  ): Promise<EdgeGatewayAttachResult>;
  confirmRevocationRecovery(
    operationId: Uint8Array,
    receipt: Uint8Array,
  ): Promise<EdgeGatewayAttachResult>;
}

interface Envelope<T> { status: number; data: T; }
interface AttachJson {
  topology: TopologyJson;
  relay?: RelayJson;
  recovery?: RecoveryJson;
}
interface TopologyJson {
  operationId: string;
  edgeHubLogicalDeviceId: string;
  childLogicalDeviceId: string;
  childDeviceInstanceId: string;
  accessEpoch: number;
  controllerId: string;
  credentialVersion: number;
  presenceKeyVersion: number;
  topologyVersion: number;
  topologyState: number;
  state: string;
  credentialExpiresAt: number;
  deliveryExpiresAt: number;
  edgeHubStored: boolean;
  childInstalled: boolean;
  gatewayProven: boolean;
  updatedAt: number;
  replayed: boolean;
}
interface RelayJson {
  operation: number;
  grantId: string;
  controllerId: string;
  credentialVersion: number;
  expiresAt: number;
  exactGrant: string;
  gatewaySecret: string;
}
interface RecoveryJson {
  operation: number;
  grantId: string;
  controllerId: string;
  credentialVersion: number;
  expiresAt: number;
  exactGrant: string;
}

const TOPOLOGY_STATE_NAMES: Readonly<Record<EdgeGatewayTopologyState, string>> = {
  [EdgeGatewayTopologyState.Created]: 'Created',
  [EdgeGatewayTopologyState.PendingAccessDelivery]: 'PendingAccessDelivery',
  [EdgeGatewayTopologyState.PendingChildInstall]: 'PendingChildInstall',
  [EdgeGatewayTopologyState.PendingGatewayProof]: 'PendingGatewayProof',
  [EdgeGatewayTopologyState.Active]: 'Active',
  [EdgeGatewayTopologyState.Expired]: 'Expired',
  [EdgeGatewayTopologyState.Cancelled]: 'Cancelled',
  [EdgeGatewayTopologyState.RollbackRequired]: 'RollbackRequired',
  [EdgeGatewayTopologyState.Revoking]: 'Revoking',
  [EdgeGatewayTopologyState.Detached]: 'Detached',
};

export class HttpEdgeGatewayAttachApi implements EdgeGatewayAttachApi {
  constructor(private readonly http: HttpClient) {}

  create(request: EdgeGatewayAttachRequest): Promise<EdgeGatewayAttachResult> {
    validateRequest(request);
    return this.send(this.http.post<Envelope<AttachJson>>(
      API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENTS,
      {
        edgeHubLogicalDeviceId: request.edgeHubLogicalDeviceId,
        childLogicalDeviceId: request.childLogicalDeviceId,
        childDeviceInstanceId: base64UrlEncode(request.childDeviceInstanceId),
      },
      {
        headers: new HttpHeaders({ 'Idempotency-Key': base64UrlEncode(request.operationId) }),
        observe: 'response',
      },
    ), [200, 201]);
  }

  get(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.send(this.http.get<Envelope<AttachJson>>(
      this.url(operationId), { observe: 'response' },
    ), [200]);
  }

  resume(
    operationId: Uint8Array,
    controlNonce?: Uint8Array,
  ): Promise<EdgeGatewayAttachResult> {
    if (controlNonce !== undefined) exactNonZero(controlNonce, 16, 'control nonce');
    return this.send(this.http.post<Envelope<AttachJson>>(
      this.url(operationId) + '/resume',
      controlNonce ? { controlNonce: base64UrlEncode(controlNonce) } : {},
      { observe: 'response' },
    ), [200]);
  }

  confirmReceipt(
    operationId: Uint8Array,
    receipt: Uint8Array,
  ): Promise<EdgeGatewayAttachResult> {
    if (!receipt.length || receipt.length > 145) throw new Error('EDGE_GATEWAY_RECEIPT_INVALID');
    return this.send(this.http.post<Envelope<AttachJson>>(
      this.url(operationId) + '/receipt',
      { receipt: base64UrlEncode(receipt), method2Confirmed: true },
      { observe: 'response' },
    ), [200]);
  }

  cancel(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.send(this.http.post<Envelope<AttachJson>>(
      this.url(operationId) + '/cancel', {}, { observe: 'response' },
    ), [200]);
  }

  detach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.send(this.http.post<Envelope<AttachJson>>(
      this.url(operationId) + '/detach', {}, { observe: 'response' },
    ), [200]);
  }

  prepareRevocationRecovery(
    operationId: Uint8Array,
    controlNonce: Uint8Array,
  ): Promise<EdgeGatewayAttachResult> {
    exactNonZero(controlNonce, 16, 'control nonce');
    return this.send(this.http.post<Envelope<AttachJson>>(
      this.url(operationId) + '/recover',
      { controlNonce: base64UrlEncode(controlNonce) },
      { observe: 'response' },
    ), [200]);
  }

  confirmRevocationRecovery(
    operationId: Uint8Array,
    receipt: Uint8Array,
  ): Promise<EdgeGatewayAttachResult> {
    if (!receipt.length || receipt.length > 145) throw new Error('EDGE_GATEWAY_RECEIPT_INVALID');
    return this.send(this.http.post<Envelope<AttachJson>>(
      this.url(operationId) + '/recover-receipt',
      { receipt: base64UrlEncode(receipt) },
      { observe: 'response' },
    ), [200]);
  }

  private url(operationId: Uint8Array): string {
    exactNonZero(operationId, 16, 'operation id');
    return API.DEVICE_V2.EDGE_GATEWAY_ATTACHMENT(base64UrlEncode(operationId));
  }

  private async send(
    request: ReturnType<HttpClient['get']>,
    expectedStatuses: readonly number[],
  ): Promise<EdgeGatewayAttachResult> {
    const response = await firstValueFrom(request) as HttpResponse<Envelope<AttachJson>>;
    requireNoStore(response.headers.get('Cache-Control'));
    const envelope = response.body;
    if (!expectedStatuses.includes(response.status)
      || envelope?.status !== response.status || !envelope.data) {
      throw new Error('EDGE_GATEWAY_RESPONSE_INVALID');
    }
    return decodeResult(envelope.data);
  }
}

function decodeResult(value: AttachJson): EdgeGatewayAttachResult {
  const topology = value?.topology;
  if (!topology || !boundedId(topology.edgeHubLogicalDeviceId)
    || !boundedId(topology.childLogicalDeviceId)
    || !u32(topology.accessEpoch) || !u32(topology.credentialVersion)
    || !u32(topology.presenceKeyVersion) || !u32(topology.topologyVersion)
    || !isEdgeGatewayTopologyState(topology.topologyState)
    || topology.state !== TOPOLOGY_STATE_NAMES[topology.topologyState]
    || !positiveTime(topology.credentialExpiresAt)
    || !positiveTime(topology.deliveryExpiresAt) || !positiveTime(topology.updatedAt)
    || topology.credentialExpiresAt <= topology.deliveryExpiresAt
    || typeof topology.edgeHubStored !== 'boolean'
    || typeof topology.childInstalled !== 'boolean'
    || typeof topology.gatewayProven !== 'boolean'
    || typeof topology.replayed !== 'boolean') {
    throw new Error('EDGE_GATEWAY_TOPOLOGY_INVALID');
  }
  const result: EdgeGatewayAttachResult = {
    topology: {
      operationId: base64UrlDecode(topology.operationId, 16),
      edgeHubLogicalDeviceId: topology.edgeHubLogicalDeviceId,
      childLogicalDeviceId: topology.childLogicalDeviceId,
      childDeviceInstanceId: base64UrlDecode(topology.childDeviceInstanceId, 16),
      accessEpoch: topology.accessEpoch,
      controllerId: base64UrlDecode(topology.controllerId, 16),
      credentialVersion: topology.credentialVersion,
      presenceKeyVersion: topology.presenceKeyVersion,
      topologyVersion: topology.topologyVersion,
      topologyState: topology.topologyState,
      credentialExpiresAt: topology.credentialExpiresAt,
      deliveryExpiresAt: topology.deliveryExpiresAt,
      edgeHubStored: topology.edgeHubStored,
      childInstalled: topology.childInstalled,
      gatewayProven: topology.gatewayProven,
      updatedAt: topology.updatedAt,
      replayed: topology.replayed,
    },
  };
  if (value.relay) result.relay = decodeRelay(value.relay);
  if (value.recovery) result.recovery = decodeRecovery(value.recovery);
  return result;
}

function decodeRelay(value: RelayJson): EdgeGatewayRelay {
  if ((value.operation !== 1 && value.operation !== 2)
    || !u32(value.credentialVersion) || !positiveTime(value.expiresAt)) {
    throw new Error('EDGE_GATEWAY_RELAY_INVALID');
  }
  let exactGrant: Uint8Array | undefined;
  let gatewaySecret: Uint8Array | undefined;
  try {
    exactGrant = base64UrlDecode(value.exactGrant);
    if (!exactGrant.length || exactGrant.length > 193) {
      throw new Error('EDGE_GATEWAY_RELAY_INVALID');
    }
    gatewaySecret = base64UrlDecode(value.gatewaySecret, 32);
    return {
      operation: value.operation,
      grantId: base64UrlDecode(value.grantId, 16),
      controllerId: base64UrlDecode(value.controllerId, 16),
      credentialVersion: value.credentialVersion,
      expiresAt: value.expiresAt,
      exactGrant,
      gatewaySecret,
    };
  } catch (error) {
    exactGrant?.fill(0);
    gatewaySecret?.fill(0);
    throw error;
  }
}

function decodeRecovery(value: RecoveryJson): EdgeGatewayRevocationRecovery {
  if (value.operation !== 3
    || !u32(value.credentialVersion) || !positiveTime(value.expiresAt)) {
    throw new Error('EDGE_GATEWAY_RECOVERY_INVALID');
  }
  let exactGrant: Uint8Array | undefined;
  let grantId: Uint8Array | undefined;
  let controllerId: Uint8Array | undefined;
  try {
    exactGrant = base64UrlDecode(value.exactGrant);
    if (!exactGrant.length || exactGrant.length > 193) {
      throw new Error('EDGE_GATEWAY_RECOVERY_INVALID');
    }
    grantId = base64UrlDecode(value.grantId, 16);
    controllerId = base64UrlDecode(value.controllerId, 16);
    return {
      operation: 3,
      grantId,
      controllerId,
      credentialVersion: value.credentialVersion,
      expiresAt: value.expiresAt,
      exactGrant,
    };
  } catch (error) {
    exactGrant?.fill(0);
    grantId?.fill(0);
    controllerId?.fill(0);
    throw error;
  }
}

function validateRequest(value: EdgeGatewayAttachRequest): void {
  exactNonZero(value.operationId, 16, 'operation id');
  exactNonZero(value.childDeviceInstanceId, 16, 'child device instance id');
  if (!boundedId(value.edgeHubLogicalDeviceId) || !boundedId(value.childLogicalDeviceId)) {
    throw new Error('EDGE_GATEWAY_REQUEST_INVALID');
  }
}

function exactNonZero(value: Uint8Array, size: number, name: string): void {
  if (!(value instanceof Uint8Array) || value.length !== size
    || !value.some(byte => byte !== 0)) throw new Error(`EDGE_GATEWAY_${name.toUpperCase()}_INVALID`);
}
function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !value.includes('/') && !value.includes('\0');
}
function u32(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 0xffffffff;
}
function positiveTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function requireNoStore(value: string | null): void {
  if (!value?.toLowerCase().split(',').some(token => token.trim() === 'no-store')) {
    throw new Error('EDGE_GATEWAY_CACHE_POLICY_INVALID');
  }
}
