import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import {
  CapacitorEdgeGatewayAttachCheckpointStore,
  CapacitorEdgeGatewayEnrollmentCheckpointStore,
  CapacitorEdgeGatewayPermitJoinCheckpointStore,
  EdgeGatewayAttachCheckpoint,
  EdgeGatewayAttachRelay,
  EdgeGatewayAttachRequest,
  EdgeGatewayAttachResult,
  EdgeGatewayAttachCheckpointStore,
  GatewayPermitJoinRecordLink,
  HttpEdgeGatewayAttachApi,
  HttpEdgeGatewayPermitJoinApi,
} from '../device-v2/edge-gateway';
import {
  BleDirectEnrollmentOptions,
  BleDirectEnrollmentResult,
  BleDirectTarget,
  base64UrlDecode,
  base64UrlEncode,
  sameBytes,
} from '../device-v2/ble-direct';
import { GatewayHttpError } from '../model/response.model';
import { EdgeGatewayTopologyState } from '../protocol/device-v2';
import { DeviceV2BleService } from './device-v2-ble.service';

export interface DeviceV2GatewayEnrollment {
  readonly candidates: readonly BleDirectTarget[];
  enrollAndAttach(
    target: BleDirectTarget,
    options: BleDirectEnrollmentOptions,
  ): Promise<{
    logicalDeviceId: string;
    attachment: EdgeGatewayAttachResult;
  }>;
  cancel(): Promise<void>;
}

export interface DeviceV2GatewayCompletion {
  logicalDeviceId: string;
  attachment: EdgeGatewayAttachResult;
}

export interface DeviceV2GatewayRecovery {
  id: string;
  logicalDeviceId: string;
  stage: 'finish_enrollment' | 'finish_attachment';
}

@Injectable({ providedIn: 'root' })
export class DeviceV2EdgeGatewayService {
  private readonly checkpoints = new CapacitorEdgeGatewayAttachCheckpointStore();
  private readonly enrollmentCheckpoints =
    new CapacitorEdgeGatewayEnrollmentCheckpointStore();
  private readonly permitJoinCheckpoints =
    new CapacitorEdgeGatewayPermitJoinCheckpointStore();
  private readonly relay: EdgeGatewayAttachRelay;
  private readonly attachApi: HttpEdgeGatewayAttachApi;
  private readonly permitJoin: HttpEdgeGatewayPermitJoinApi;

  constructor(
    http: HttpClient,
    private readonly ble: DeviceV2BleService,
  ) {
    this.attachApi = new HttpEdgeGatewayAttachApi(http);
    this.relay = new EdgeGatewayAttachRelay(
      this.attachApi, this.checkpoints, ble,
    );
    this.permitJoin = new HttpEdgeGatewayPermitJoinApi(http);
  }

  async beginEnrollment(
    edgeHubLogicalDeviceId: string,
    discoveryTimeoutMs = 2_500,
  ): Promise<DeviceV2GatewayEnrollment> {
    await this.recoverPermitJoinWindows(edgeHubLogicalDeviceId);
    const link = this.permitJoinLink(edgeHubLogicalDeviceId);
    const candidates = await link.discoverProvisioningDevices(discoveryTimeoutMs);
    let state: 'selecting' | 'consumed' | 'closed' = 'selecting';
    const enroll = async (
      target: BleDirectTarget,
      options: BleDirectEnrollmentOptions,
    ): Promise<BleDirectEnrollmentResult> => {
      if (state !== 'selecting' || !candidates.some(candidate =>
        candidate.device.deviceId === target.device.deviceId
        && sameBytes(candidate.profile.modeLocator, target.profile.modeLocator))) {
        throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SELECTION_INVALID');
      }
      state = 'consumed';
      return this.ble.enrollUsing(link, target, options, {
        pendingCredentialSaved: logicalDeviceId => this.enrollmentCheckpoints.save({
          edgeHubLogicalDeviceId,
          childLogicalDeviceId: logicalDeviceId,
        }),
      });
    };
    return Object.freeze({
      candidates: Object.freeze(candidates),
      enrollAndAttach: async (
        target: BleDirectTarget,
        options: BleDirectEnrollmentOptions,
      ) => {
        const enrollment = await enroll(target, options);
        try {
          return await this.attachEnrollment(edgeHubLogicalDeviceId, enrollment);
        } finally {
          state = 'closed';
        }
      },
      cancel: async () => {
        if (state !== 'selecting') return;
        state = 'closed';
        await link.disconnect();
      },
    });
  }

  private async resumeEnrollmentAndAttach(
    edgeHubLogicalDeviceId: string,
    childLogicalDeviceId: string,
  ): Promise<{
    logicalDeviceId: string;
    attachment: EdgeGatewayAttachResult;
  }> {
    await this.recoverPermitJoinWindows(edgeHubLogicalDeviceId);
    const enrollment = await this.ble.resumeUsing(
      this.permitJoinLink(edgeHubLogicalDeviceId),
      childLogicalDeviceId,
    );
    return this.attachEnrollment(edgeHubLogicalDeviceId, enrollment);
  }

  async recoveries(
    edgeHubLogicalDeviceId: string,
  ): Promise<DeviceV2GatewayRecovery[]> {
    const [enrollmentCheckpoints, checkpoints] = await Promise.all([
      this.enrollmentCheckpoints.list(),
      this.checkpoints.list(),
    ]);
    const output: DeviceV2GatewayRecovery[] = [];
    const attaching = new Set<string>();
    for (const checkpoint of checkpoints) {
      try {
        if (checkpoint.edgeHubLogicalDeviceId === edgeHubLogicalDeviceId) {
          attaching.add(checkpoint.childLogicalDeviceId);
          output.push({
            id: `attachment:${base64UrlEncode(checkpoint.operationId)}`,
            logicalDeviceId: checkpoint.childLogicalDeviceId,
            stage: 'finish_attachment',
          });
        }
      } finally {
        checkpoint.operationId.fill(0);
        checkpoint.childDeviceInstanceId.fill(0);
      }
    }
    for (const checkpoint of enrollmentCheckpoints) {
      if (checkpoint.edgeHubLogicalDeviceId !== edgeHubLogicalDeviceId
        || attaching.has(checkpoint.childLogicalDeviceId)) continue;
      const state = await this.ble.enrollmentCredentialState(
        checkpoint.childLogicalDeviceId,
      );
      if (!state) {
        await this.enrollmentCheckpoints.remove(checkpoint.childLogicalDeviceId);
        continue;
      }
      output.push({
        id: `enrollment:${checkpoint.childLogicalDeviceId}`,
        logicalDeviceId: checkpoint.childLogicalDeviceId,
        stage: state === 'pending' ? 'finish_enrollment' : 'finish_attachment',
      });
    }
    return output.sort((left, right) => {
      if (left.stage !== right.stage) return left.stage === 'finish_attachment' ? -1 : 1;
      return left.logicalDeviceId.localeCompare(right.logicalDeviceId);
    });
  }

  async resumeRecovery(
    edgeHubLogicalDeviceId: string,
    recovery: DeviceV2GatewayRecovery,
  ): Promise<DeviceV2GatewayCompletion> {
    if (recovery.id === `enrollment:${recovery.logicalDeviceId}`) {
      const checkpoint = (await this.enrollmentCheckpoints.list()).find(value =>
        value.edgeHubLogicalDeviceId === edgeHubLogicalDeviceId
        && value.childLogicalDeviceId === recovery.logicalDeviceId);
      const state = checkpoint
        ? await this.ble.enrollmentCredentialState(recovery.logicalDeviceId)
        : undefined;
      if (!state
        || recovery.stage !== (state === 'pending'
          ? 'finish_enrollment' : 'finish_attachment')) {
        throw new Error('EDGE_GATEWAY_RECOVERY_NOT_FOUND');
      }
      if (state === 'active') {
        return this.connectAndAttach(edgeHubLogicalDeviceId, recovery.logicalDeviceId);
      }
      return this.resumeEnrollmentAndAttach(
        edgeHubLogicalDeviceId, recovery.logicalDeviceId,
      );
    }
    if (recovery.stage !== 'finish_attachment'
      || !recovery.id.startsWith('attachment:')) {
      throw new Error('EDGE_GATEWAY_RECOVERY_INVALID');
    }
    let operationId: Uint8Array;
    try {
      operationId = base64UrlDecode(recovery.id.slice('attachment:'.length), 16);
    } catch {
      throw new Error('EDGE_GATEWAY_RECOVERY_INVALID');
    }
    try {
      const checkpoint = await this.checkpoints.load(operationId);
      if (!checkpoint
        || checkpoint.edgeHubLogicalDeviceId !== edgeHubLogicalDeviceId
        || checkpoint.childLogicalDeviceId !== recovery.logicalDeviceId) {
        if (checkpoint) {
          checkpoint.operationId.fill(0);
          checkpoint.childDeviceInstanceId.fill(0);
        }
        throw new Error('EDGE_GATEWAY_RECOVERY_NOT_FOUND');
      }
      try {
        return {
          logicalDeviceId: checkpoint.childLogicalDeviceId,
          attachment: await this.resumeAttachment(checkpoint),
        };
      } finally {
        checkpoint.operationId.fill(0);
        checkpoint.childDeviceInstanceId.fill(0);
      }
    } finally {
      operationId.fill(0);
    }
  }

  create(input: Omit<EdgeGatewayAttachRequest, 'operationId'>): Promise<EdgeGatewayAttachResult> {
    const operationId = randomOperationId();
    return this.relay.create({ ...input, operationId });
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

  private async attachEnrollment(
    edgeHubLogicalDeviceId: string,
    enrollment: BleDirectEnrollmentResult,
  ): Promise<{
    logicalDeviceId: string;
    attachment: EdgeGatewayAttachResult;
  }> {
    let childDeviceInstanceId: Uint8Array | undefined;
    let operationId: Uint8Array | undefined;
    try {
      childDeviceInstanceId = await this.ble.credentialDeviceInstanceId(
        enrollment.logicalDeviceId,
      );
      operationId = randomOperationId();
      const request: EdgeGatewayAttachRequest = {
        operationId,
        edgeHubLogicalDeviceId,
        childLogicalDeviceId: enrollment.logicalDeviceId,
        childDeviceInstanceId,
      };
      const child = this.ble.createGatewayChildControl(
        enrollment,
        () => this.permitJoinLink(edgeHubLogicalDeviceId),
      );
      const attach = new EdgeGatewayAttachRelay(
        this.attachApi,
        this.attachCheckpoints(enrollment.logicalDeviceId),
        child,
      );
      await attach.create(request);
      const attachment = await attach.resume(request);
      return { logicalDeviceId: enrollment.logicalDeviceId, attachment };
    } finally {
      childDeviceInstanceId?.fill(0);
      operationId?.fill(0);
      await enrollment.session.close().catch(() => undefined);
    }
  }

  private async resumeAttachment(
    checkpoint: EdgeGatewayAttachCheckpoint,
  ): Promise<EdgeGatewayAttachResult> {
    const checkpoints = this.attachCheckpoints(checkpoint.childLogicalDeviceId);
    const cloud = new EdgeGatewayAttachRelay(this.attachApi, checkpoints, this.ble);
    let current = await this.attachApi.get(checkpoint.operationId);
    if (current.topology.topologyState === EdgeGatewayTopologyState.Created
      || current.topology.topologyState === EdgeGatewayTopologyState.PendingAccessDelivery) {
      // Secret delivery is Hub/cloud work. Do not open and hold a child GATT
      // session while waiting for it. Once this advances to PendingChildInstall,
      // no further cloud transition is possible without the child receipt.
      current = await cloud.advanceCloud(checkpoint);
    }
    if (current.topology.topologyState !== EdgeGatewayTopologyState.PendingChildInstall) {
      return cloud.resume(checkpoint);
    }
    const enrollment = await this.ble.connectUsing(
      this.permitJoinLink(checkpoint.edgeHubLogicalDeviceId),
      checkpoint.childLogicalDeviceId,
    );
    try {
      const child = this.ble.createGatewayChildControl(
        enrollment,
        () => this.permitJoinLink(checkpoint.edgeHubLogicalDeviceId),
      );
      return await new EdgeGatewayAttachRelay(
        this.attachApi,
        checkpoints,
        child,
      ).resume(checkpoint);
    } finally {
      await enrollment.session.close().catch(() => undefined);
    }
  }

  private async connectAndAttach(
    edgeHubLogicalDeviceId: string,
    childLogicalDeviceId: string,
  ): Promise<DeviceV2GatewayCompletion> {
    await this.recoverPermitJoinWindows(edgeHubLogicalDeviceId);
    const enrollment = await this.ble.connectUsing(
      this.permitJoinLink(edgeHubLogicalDeviceId), childLogicalDeviceId,
    );
    return this.attachEnrollment(edgeHubLogicalDeviceId, enrollment);
  }

  private attachCheckpoints(childLogicalDeviceId: string): EdgeGatewayAttachCheckpointStore {
    return {
      save: value => this.checkpoints.save(value),
      load: operationId => this.checkpoints.load(operationId),
      list: () => this.checkpoints.list(),
      remove: async operationId => {
        // Remove the broader enrollment marker first. If the App is killed
        // between these two durable deletes, the exact attach checkpoint still
        // contains everything required to resume safely.
        await this.enrollmentCheckpoints.remove(childLogicalDeviceId);
        await this.checkpoints.remove(operationId);
      },
    };
  }

  private permitJoinLink(edgeHubLogicalDeviceId: string): GatewayPermitJoinRecordLink {
    return new GatewayPermitJoinRecordLink(
      this.permitJoin,
      edgeHubLogicalDeviceId,
      1,
      this.permitJoinCheckpoints,
    );
  }

  private async recoverPermitJoinWindows(edgeHubLogicalDeviceId: string): Promise<void> {
    const checkpoints = await this.permitJoinCheckpoints.list();
    for (const checkpoint of checkpoints) {
      if (checkpoint.edgeHubLogicalDeviceId !== edgeHubLogicalDeviceId
        || checkpoint.adapterId !== 1) {
        checkpoint.operationId.fill(0);
        continue;
      }
      try {
        let window = await this.permitJoin.close(checkpoint.operationId);
        const deadline = Date.now() + 15_000;
        while (window.state === 'pending_open' || window.state === 'ready'
          || window.state === 'pending_close') {
          if (Date.now() >= deadline) {
            throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RECOVERY_TIMEOUT');
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          window = await this.permitJoin.get(checkpoint.operationId);
        }
        await this.permitJoinCheckpoints.remove(checkpoint.operationId);
      } catch (error) {
        if (error instanceof GatewayHttpError
          && (error.httpStatus === 404 || error.httpStatus === 410)) {
          await this.permitJoinCheckpoints.remove(checkpoint.operationId);
        } else {
          throw error;
        }
      } finally {
        checkpoint.operationId.fill(0);
      }
    }
  }
}

function randomOperationId(): Uint8Array {
  const operationId = new Uint8Array(16);
  do {
    crypto.getRandomValues(operationId);
  } while (!operationId.some(byte => byte !== 0));
  return operationId;
}
