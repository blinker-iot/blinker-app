import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';

import { API } from '../../../configs/api.config';
import { base64UrlDecode, base64UrlEncode, sameBytes } from '../ble-direct/wire';

export type EdgeGatewayPermitJoinWindowState =
  'pending_open' | 'ready' | 'pending_close' | 'closed' | 'expired'
  | 'rejected' | 'busy' | 'unsupported';

export interface EdgeGatewayPermitJoinWindow {
  operationId: Uint8Array;
  edgeHubLogicalDeviceId: string;
  adapterId: number;
  state: EdgeGatewayPermitJoinWindowState;
  expiresAt: number;
  readyAt: number | null;
  closedAt: number | null;
  updatedAt: number;
  replayed: boolean;
}

export interface EdgeGatewayPermitJoinRelayView {
  operationId: Uint8Array;
  relaySessionId: Uint8Array;
  revision: number;
  candidateSnapshot: Uint8Array | null;
  selectResult: Uint8Array | null;
  downAck: Uint8Array | null;
  upstreamBatch: Uint8Array | null;
  expiresAt: number;
}

export interface EdgeGatewayPermitJoinApi {
  open(
    operationId: Uint8Array,
    edgeHubLogicalDeviceId: string,
    adapterId: number,
  ): Promise<EdgeGatewayPermitJoinWindow>;
  get(operationId: Uint8Array): Promise<EdgeGatewayPermitJoinWindow>;
  close(operationId: Uint8Array): Promise<EdgeGatewayPermitJoinWindow>;
  readRelay(operationId: Uint8Array): Promise<EdgeGatewayPermitJoinRelayView>;
  sendRelay(
    operationId: Uint8Array,
    exactFrame: Uint8Array,
  ): Promise<EdgeGatewayPermitJoinRelayView>;
}

interface Envelope<T> { status: number; data: T; }

interface WindowJson {
  operationId: string;
  edgeHubLogicalDeviceId: string;
  adapterId: number;
  state: string;
  expiresAt: number;
  readyAt: number | null;
  closedAt: number | null;
  updatedAt: number;
  replayed: boolean;
}

interface RelayJson {
  operationId: string;
  relaySessionId: string;
  revision: number;
  candidateSnapshot: string | null;
  selectResult: string | null;
  downAck: string | null;
  upstreamBatch: string | null;
  expiresAt: number;
}

const WINDOW_KEYS = [
  'operationId', 'edgeHubLogicalDeviceId', 'adapterId', 'state', 'expiresAt',
  'readyAt', 'closedAt', 'updatedAt', 'replayed',
] as const;
const RELAY_KEYS = [
  'operationId', 'relaySessionId', 'revision', 'candidateSnapshot',
  'selectResult', 'downAck', 'upstreamBatch', 'expiresAt',
] as const;
const WINDOW_STATES = new Set<string>([
  'pending_open', 'ready', 'pending_close', 'closed', 'expired',
  'rejected', 'busy', 'unsupported',
]);

export class HttpEdgeGatewayPermitJoinApi implements EdgeGatewayPermitJoinApi {
  constructor(private readonly http: HttpClient) {}

  open(
    operationId: Uint8Array,
    edgeHubLogicalDeviceId: string,
    adapterId: number,
  ): Promise<EdgeGatewayPermitJoinWindow> {
    exactOperationId(operationId);
    if (!boundedId(edgeHubLogicalDeviceId)
      || !Number.isSafeInteger(adapterId) || adapterId < 1 || adapterId > 0xffff) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPEN_INVALID');
    }
    return this.window(this.http.post<Envelope<WindowJson>>(
      API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOINS,
      { edgeHubLogicalDeviceId, adapterId },
      {
        headers: new HttpHeaders({ 'Idempotency-Key': base64UrlEncode(operationId) }),
        observe: 'response',
      },
    ), operationId, [200, 201]);
  }

  get(operationId: Uint8Array): Promise<EdgeGatewayPermitJoinWindow> {
    return this.window(this.http.get<Envelope<WindowJson>>(
      this.url(operationId), { observe: 'response' },
    ), operationId, [200]);
  }

  close(operationId: Uint8Array): Promise<EdgeGatewayPermitJoinWindow> {
    return this.window(this.http.post<Envelope<WindowJson>>(
      this.url(operationId) + '/close', {}, { observe: 'response' },
    ), operationId, [200]);
  }

  readRelay(operationId: Uint8Array): Promise<EdgeGatewayPermitJoinRelayView> {
    return this.relay(this.http.get<Envelope<RelayJson>>(
      this.url(operationId) + '/relay', { observe: 'response' },
    ), operationId);
  }

  sendRelay(
    operationId: Uint8Array,
    exactFrame: Uint8Array,
  ): Promise<EdgeGatewayPermitJoinRelayView> {
    if (!(exactFrame instanceof Uint8Array) || !exactFrame.length || exactFrame.length > 363) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RELAY_FRAME_INVALID');
    }
    return this.relay(this.http.post<Envelope<RelayJson>>(
      this.url(operationId) + '/relay',
      { frame: base64UrlEncode(exactFrame) },
      { observe: 'response' },
    ), operationId);
  }

  private url(operationId: Uint8Array): string {
    exactOperationId(operationId);
    return API.DEVICE_V2.EDGE_GATEWAY_PERMIT_JOIN(base64UrlEncode(operationId));
  }

  private async window(
    request: Observable<HttpResponse<Envelope<WindowJson>>>,
    operationId: Uint8Array,
    expectedStatuses: readonly number[],
  ): Promise<EdgeGatewayPermitJoinWindow> {
    const response = await firstValueFrom(request);
    const data = envelope(response, expectedStatuses);
    if (!exactObject(data, WINDOW_KEYS) || !boundedId(data.edgeHubLogicalDeviceId)
      || !Number.isSafeInteger(data.adapterId) || data.adapterId < 1 || data.adapterId > 0xffff
      || !WINDOW_STATES.has(data.state) || !positiveTime(data.expiresAt)
      || !nullableTime(data.readyAt) || !nullableTime(data.closedAt)
      || !positiveTime(data.updatedAt) || typeof data.replayed !== 'boolean') {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_WINDOW_INVALID');
    }
    const decodedOperationId = base64UrlDecode(data.operationId, 16);
    if (!sameBytes(decodedOperationId, operationId)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_MISMATCH');
    }
    return {
      operationId: decodedOperationId,
      edgeHubLogicalDeviceId: data.edgeHubLogicalDeviceId,
      adapterId: data.adapterId,
      state: data.state as EdgeGatewayPermitJoinWindowState,
      expiresAt: data.expiresAt,
      readyAt: data.readyAt,
      closedAt: data.closedAt,
      updatedAt: data.updatedAt,
      replayed: data.replayed,
    };
  }

  private async relay(
    request: Observable<HttpResponse<Envelope<RelayJson>>>,
    operationId: Uint8Array,
  ): Promise<EdgeGatewayPermitJoinRelayView> {
    const response = await firstValueFrom(request);
    const data = envelope(response, [200]);
    if (!exactObject(data, RELAY_KEYS)
      || !Number.isSafeInteger(data.revision) || data.revision < 0
      || data.revision > 0xffff_ffff || !positiveTime(data.expiresAt)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RELAY_INVALID');
    }
    const decodedOperationId = base64UrlDecode(data.operationId, 16);
    if (!sameBytes(decodedOperationId, operationId)) {
      throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_MISMATCH');
    }
    return {
      operationId: decodedOperationId,
      relaySessionId: base64UrlDecode(data.relaySessionId, 16),
      revision: data.revision,
      candidateSnapshot: optionalFrame(data.candidateSnapshot, 125),
      selectResult: optionalFrame(data.selectResult, 41),
      downAck: optionalFrame(data.downAck, 32),
      upstreamBatch: optionalFrame(data.upstreamBatch, 363),
      expiresAt: data.expiresAt,
    };
  }
}

function envelope<T>(
  response: HttpResponse<Envelope<T>>,
  expectedStatuses: readonly number[],
): T {
  requireNoStore(response.headers.get('Cache-Control'));
  const body = response.body;
  if (!expectedStatuses.includes(response.status)
    || body?.status !== response.status || body.data === undefined || body.data === null) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RESPONSE_INVALID');
  }
  return body.data;
}

function optionalFrame(value: unknown, maximum: number): Uint8Array | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RELAY_INVALID');
  const decoded = base64UrlDecode(value);
  if (decoded.length > maximum) throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RELAY_INVALID');
  return decoded;
}

function exactObject<T extends object>(
  value: T,
  keys: readonly string[],
): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function exactOperationId(value: Uint8Array): void {
  if (!(value instanceof Uint8Array) || value.length !== 16
    || !value.some(byte => byte !== 0)) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_ID_INVALID');
  }
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !value.includes('\0') && !value.includes('/');
}

function positiveTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function nullableTime(value: unknown): value is number | null {
  return value === null || positiveTime(value);
}

function requireNoStore(value: string | null): void {
  if (!value?.split(',').some(token => token.trim().toLowerCase() === 'no-store')) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CACHE_POLICY_INVALID');
  }
}
