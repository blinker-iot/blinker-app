import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import {
  CapacitorEdgeGatewayAttachCheckpointStore,
  EdgeGatewayAttachCheckpoint,
  EdgeGatewayAttachRelay,
  EdgeGatewayAttachRequest,
  EdgeGatewayAttachResult,
  HttpEdgeGatewayAttachApi,
} from '../device-v2/edge-gateway';
import { DeviceV2BleService } from './device-v2-ble.service';

@Injectable({ providedIn: 'root' })
export class DeviceV2EdgeGatewayService {
  private readonly checkpoints = new CapacitorEdgeGatewayAttachCheckpointStore();
  private readonly relay: EdgeGatewayAttachRelay;

  constructor(http: HttpClient, ble: DeviceV2BleService) {
    this.relay = new EdgeGatewayAttachRelay(
      new HttpEdgeGatewayAttachApi(http), this.checkpoints, ble,
    );
  }

  create(input: Omit<EdgeGatewayAttachRequest, 'operationId'>): Promise<EdgeGatewayAttachResult> {
    const operationId = new Uint8Array(16);
    do {
      crypto.getRandomValues(operationId);
    } while (!operationId.some(byte => byte !== 0));
    return this.relay.create({ ...input, operationId });
  }

  resume(checkpoint: EdgeGatewayAttachCheckpoint): Promise<EdgeGatewayAttachResult> {
    return this.relay.resume(checkpoint);
  }

  pending(): Promise<EdgeGatewayAttachCheckpoint[]> {
    return this.checkpoints.list();
  }

  cancel(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.relay.cancel(operationId);
  }

  detach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.relay.detach(operationId);
  }

  recoverDetach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.relay.recoverDetach(operationId);
  }
}
