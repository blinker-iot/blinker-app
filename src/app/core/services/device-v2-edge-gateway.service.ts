import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { API } from '../../configs/api.config';
import {
  DeviceV2AccountContext,
  assertDeviceV2AccountContext,
  captureDeviceV2AccountContext,
} from '../device-v2/account-scope';
import {
  CapacitorEdgeGatewayAttachCheckpointStore,
  CapacitorEdgeGatewayEnrollmentCheckpointStore,
  CapacitorEdgeGatewayPermitJoinCheckpointStore,
  EdgeGatewayAttachCheckpoint,
  EdgeGatewayAttachApi,
  EdgeGatewayAttachRelay,
  EdgeGatewayAttachRequest,
  EdgeGatewayAttachResult,
  EdgeGatewayAttachCheckpointStore,
  EdgeGatewayEnrollmentCheckpointStore,
  EdgeGatewayPermitJoinApi,
  EdgeGatewayPermitJoinCheckpointStore,
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
import { DataService } from './data.service';
import { DeviceV2BleService } from './device-v2-ble.service';

export interface DeviceV2GatewayEnrollment {
  readonly candidates: readonly BleDirectTarget[];
  enrollAndAttach(
    target: BleDirectTarget,
    options: BleDirectEnrollmentOptions,
  ): Promise<DeviceV2GatewayCompletion>;
  cancel(): Promise<void>;
}

export type DeviceV2GatewayCompletion = {
  logicalDeviceId: string;
} & (
  | { attachment: EdgeGatewayAttachResult; retirementPending?: false }
  | { attachment?: never; retirementPending: true }
);

export interface DeviceV2GatewayRecovery {
  id: string;
  logicalDeviceId: string;
  stage: 'finish_enrollment' | 'finish_attachment';
}

@Injectable({ providedIn: 'root' })
export class DeviceV2EdgeGatewayService {
  private readonly checkpoints: CapacitorEdgeGatewayAttachCheckpointStore;
  private readonly enrollmentCheckpoints: CapacitorEdgeGatewayEnrollmentCheckpointStore;
  private readonly permitJoinCheckpoints: CapacitorEdgeGatewayPermitJoinCheckpointStore;
  private readonly attachApi: HttpEdgeGatewayAttachApi;
  private readonly permitJoin: HttpEdgeGatewayPermitJoinApi;

  constructor(
    http: HttpClient,
    private readonly ble: DeviceV2BleService,
    private readonly data: DataService,
  ) {
    const scope = () => captureDeviceV2AccountContext(this.data, API.BASE_URL);
    this.checkpoints = new CapacitorEdgeGatewayAttachCheckpointStore(scope);
    this.enrollmentCheckpoints = new CapacitorEdgeGatewayEnrollmentCheckpointStore(scope);
    this.permitJoinCheckpoints = new CapacitorEdgeGatewayPermitJoinCheckpointStore(scope);
    this.attachApi = new HttpEdgeGatewayAttachApi(http);
    this.permitJoin = new HttpEdgeGatewayPermitJoinApi(http);
  }

  async beginEnrollment(
    edgeHubLogicalDeviceId: string,
    discoveryTimeoutMs = 2_500,
  ): Promise<DeviceV2GatewayEnrollment> {
    const context = this.accountContext();
    await this.recoverPermitJoinWindows(edgeHubLogicalDeviceId, context);
    const link = this.permitJoinLink(edgeHubLogicalDeviceId, context);
    const candidates = await link.discoverProvisioningDevices(discoveryTimeoutMs);
    this.assertAccount(context);
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
      this.assertAccount(context);
      state = 'consumed';
      const enrollment = await this.ble.enrollUsing(link, target, options, {
        pendingCredentialSaved: logicalDeviceId => this.accountEnrollmentCheckpoints(
          context,
        ).save({
          edgeHubLogicalDeviceId,
          childLogicalDeviceId: logicalDeviceId,
        }),
      });
      this.assertAccount(context);
      return enrollment;
    };
    return Object.freeze({
      candidates: Object.freeze(candidates),
      enrollAndAttach: async (
        target: BleDirectTarget,
        options: BleDirectEnrollmentOptions,
      ) => {
        const enrollment = await enroll(target, options);
        try {
          return await this.attachEnrollment(edgeHubLogicalDeviceId, enrollment, context);
        } finally {
          state = 'closed';
        }
      },
      cancel: async () => {
        if (state === 'closed') return;
        state = 'closed';
        await link.disconnect();
      },
    });
  }

  private async resumeEnrollmentAndAttach(
    edgeHubLogicalDeviceId: string,
    childLogicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): Promise<DeviceV2GatewayCompletion> {
    this.assertAccount(context);
    await this.recoverPermitJoinWindows(edgeHubLogicalDeviceId, context);
    const enrollment = await this.ble.resumeUsing(
      this.permitJoinLink(edgeHubLogicalDeviceId, context),
      childLogicalDeviceId,
    );
    this.assertAccount(context);
    return this.attachEnrollment(edgeHubLogicalDeviceId, enrollment, context);
  }

  async recoveries(
    edgeHubLogicalDeviceId: string,
  ): Promise<DeviceV2GatewayRecovery[]> {
    const context = this.accountContext();
    const enrollmentStore = this.accountEnrollmentCheckpoints(context);
    const attachStore = this.accountAttachCheckpoints(context);
    const [enrollmentCheckpoints, checkpoints] = await Promise.all([
      enrollmentStore.list(),
      attachStore.list(),
    ]);
    this.assertAccount(context);
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
      this.assertAccount(context);
      if (!state) {
        await enrollmentStore.remove(checkpoint.childLogicalDeviceId);
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
    const context = this.accountContext();
    const enrollmentStore = this.accountEnrollmentCheckpoints(context);
    const attachStore = this.accountAttachCheckpoints(context);
    if (recovery.id === `enrollment:${recovery.logicalDeviceId}`) {
      const checkpoint = (await enrollmentStore.list()).find(value =>
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
        return this.beginAttachment(
          edgeHubLogicalDeviceId, recovery.logicalDeviceId, context,
        );
      }
      return this.resumeEnrollmentAndAttach(
        edgeHubLogicalDeviceId, recovery.logicalDeviceId, context,
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
      const checkpoint = await attachStore.load(operationId);
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
        return await this.completeAttachment(checkpoint, context);
      } finally {
        checkpoint.operationId.fill(0);
        checkpoint.childDeviceInstanceId.fill(0);
      }
    } finally {
      operationId.fill(0);
    }
  }

  create(input: Omit<EdgeGatewayAttachRequest, 'operationId'>): Promise<EdgeGatewayAttachResult> {
    const context = this.accountContext();
    const operationId = randomOperationId();
    return this.relayFor(context).create({ ...input, operationId });
  }

  cancel(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    const context = this.accountContext();
    return this.relayFor(context).cancel(operationId);
  }

  detach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    const context = this.accountContext();
    return this.relayFor(context).detach(operationId);
  }

  recoverDetach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    const context = this.accountContext();
    return this.relayFor(context).recoverDetach(operationId);
  }

  private async attachEnrollment(
    edgeHubLogicalDeviceId: string,
    enrollment: BleDirectEnrollmentResult,
    context: DeviceV2AccountContext,
  ): Promise<DeviceV2GatewayCompletion> {
    // Enrollment has committed. Its session is not an attachment resource:
    // release its permit window before Hub delivery can use the same radio.
    await enrollment.session.close();
    return this.beginAttachment(edgeHubLogicalDeviceId, enrollment.logicalDeviceId, context);
  }

  private async beginAttachment(
    edgeHubLogicalDeviceId: string,
    childLogicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): Promise<DeviceV2GatewayCompletion> {
    this.assertAccount(context);
    await this.recoverPermitJoinWindows(edgeHubLogicalDeviceId, context);
    let childDeviceInstanceId: Uint8Array | undefined;
    let operationId: Uint8Array | undefined;
    try {
      childDeviceInstanceId = await this.ble.credentialDeviceInstanceId(
        childLogicalDeviceId,
      );
      operationId = randomOperationId();
      const request: EdgeGatewayAttachRequest = {
        operationId,
        edgeHubLogicalDeviceId,
        childLogicalDeviceId,
        childDeviceInstanceId,
      };
      await this.attachCheckpoints(childLogicalDeviceId, context).save(request);
      return await this.completeAttachment(request, context);
    } finally {
      childDeviceInstanceId?.fill(0);
      operationId?.fill(0);
    }
  }

  private async completeAttachment(
    checkpoint: EdgeGatewayAttachCheckpoint,
    context: DeviceV2AccountContext,
  ): Promise<DeviceV2GatewayCompletion> {
    try {
      const attachment = await this.resumeAttachment(checkpoint, context);
      this.assertAccount(context);
      return { logicalDeviceId: checkpoint.childLogicalDeviceId, attachment };
    } catch (error) {
      this.assertAccount(context);
      if (error instanceof GatewayHttpError && error.httpStatus === 409
        && error.code === 'EDGE_GATEWAY_RETIREMENT_PENDING') {
        // No topology exists yet. Keep the exact checkpoint and let the owner
        // continue later; do not retry, reopen BLE, or invent a pending topology.
        return { logicalDeviceId: checkpoint.childLogicalDeviceId, retirementPending: true };
      }
      throw error;
    }
  }

  private async resumeAttachment(
    checkpoint: EdgeGatewayAttachCheckpoint,
    context: DeviceV2AccountContext,
  ): Promise<EdgeGatewayAttachResult> {
    this.assertAccount(context);
    const checkpoints = this.attachCheckpoints(checkpoint.childLogicalDeviceId, context);
    const api = this.accountAttachApi(context);
    const cloud = new EdgeGatewayAttachRelay(api, checkpoints, this.ble);
    // Cloud advancement never invokes child control. Return a pending result
    // as-is; a second generic resume could cross into installation using the
    // phone's direct BLE controller instead of this exact Hub relay.
    const current = await cloud.advanceCloud(checkpoint);
    if (current.topology.topologyState !== EdgeGatewayTopologyState.PendingChildInstall) {
      return current;
    }
    const enrollment = await this.ble.connectUsing(
      this.permitJoinLink(checkpoint.edgeHubLogicalDeviceId, context),
      checkpoint.childLogicalDeviceId,
    );
    try {
      const child = this.ble.createGatewayChildControl(
        enrollment,
        () => this.permitJoinLink(checkpoint.edgeHubLogicalDeviceId, context),
      );
      return await new EdgeGatewayAttachRelay(
        api,
        checkpoints,
        child,
      ).resume(checkpoint);
    } finally {
      await enrollment.session.close().catch(() => undefined);
    }
  }

  private attachCheckpoints(
    childLogicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): EdgeGatewayAttachCheckpointStore {
    const attachments = this.accountAttachCheckpoints(context);
    const enrollments = this.accountEnrollmentCheckpoints(context);
    return {
      save: value => attachments.save(value),
      load: operationId => attachments.load(operationId),
      list: () => attachments.list(),
      remove: async operationId => {
        // Remove the broader enrollment marker first. If the App is killed
        // between these two durable deletes, the exact attach checkpoint still
        // contains everything required to resume safely.
        await enrollments.remove(childLogicalDeviceId);
        await attachments.remove(operationId);
      },
    };
  }

  private permitJoinLink(
    edgeHubLogicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): GatewayPermitJoinRecordLink {
    return new GatewayPermitJoinRecordLink(
      this.accountPermitJoinApi(context),
      edgeHubLogicalDeviceId,
      1,
      this.accountPermitJoinCheckpoints(context),
    );
  }

  private async recoverPermitJoinWindows(
    edgeHubLogicalDeviceId: string,
    context: DeviceV2AccountContext,
  ): Promise<void> {
    const api = this.accountPermitJoinApi(context);
    const store = this.accountPermitJoinCheckpoints(context);
    const checkpoints = await store.list();
    for (const checkpoint of checkpoints) {
      if (checkpoint.edgeHubLogicalDeviceId !== edgeHubLogicalDeviceId
        || checkpoint.adapterId !== 1) {
        checkpoint.operationId.fill(0);
        continue;
      }
      try {
        let window = await api.close(checkpoint.operationId);
        const deadline = Date.now() + 15_000;
        while (window.state === 'pending_open' || window.state === 'ready'
          || window.state === 'pending_close') {
          if (Date.now() >= deadline) {
            throw new Error('EDGE_GATEWAY_PERMIT_JOIN_RECOVERY_TIMEOUT');
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          window = await api.get(checkpoint.operationId);
        }
        await store.remove(checkpoint.operationId);
      } catch (error) {
        if (error instanceof GatewayHttpError
          && (error.httpStatus === 404 || error.httpStatus === 410)) {
          await store.remove(checkpoint.operationId);
        } else {
          throw error;
        }
      } finally {
        checkpoint.operationId.fill(0);
      }
    }
  }

  private accountContext(): DeviceV2AccountContext {
    return captureDeviceV2AccountContext(this.data, API.BASE_URL);
  }

  private assertAccount(context: DeviceV2AccountContext): void {
    assertDeviceV2AccountContext(this.data, context);
  }

  private relayFor(context: DeviceV2AccountContext): EdgeGatewayAttachRelay {
    return new EdgeGatewayAttachRelay(
      this.accountAttachApi(context),
      this.accountAttachCheckpoints(context),
      this.ble,
    );
  }

  private accountAttachApi(context: DeviceV2AccountContext): EdgeGatewayAttachApi {
    const call = async (
      operation: () => Promise<EdgeGatewayAttachResult>,
    ): Promise<EdgeGatewayAttachResult> => {
      this.assertAccount(context);
      const result = await operation();
      try {
        this.assertAccount(context);
        return result;
      } catch (error) {
        clearAttachResult(result);
        throw error;
      }
    };
    return {
      create: request => call(() => this.attachApi.create(request)),
      get: operationId => call(() => this.attachApi.get(operationId)),
      resume: (operationId, controlNonce) => call(
        () => this.attachApi.resume(operationId, controlNonce),
      ),
      confirmReceipt: (operationId, receipt) => call(
        () => this.attachApi.confirmReceipt(operationId, receipt),
      ),
      cancel: operationId => call(() => this.attachApi.cancel(operationId)),
      detach: operationId => call(() => this.attachApi.detach(operationId)),
      prepareRevocationRecovery: (operationId, controlNonce) => call(
        () => this.attachApi.prepareRevocationRecovery(operationId, controlNonce),
      ),
      confirmRevocationRecovery: (operationId, receipt) => call(
        () => this.attachApi.confirmRevocationRecovery(operationId, receipt),
      ),
    };
  }

  private accountPermitJoinApi(
    context: DeviceV2AccountContext,
  ): EdgeGatewayPermitJoinApi {
    const call = async <T>(
      operation: () => Promise<T>,
      clear: (result: T) => void,
    ): Promise<T> => {
      this.assertAccount(context);
      const result = await operation();
      try {
        this.assertAccount(context);
        return result;
      } catch (error) {
        clear(result);
        throw error;
      }
    };
    return {
      open: (operationId, edgeHubLogicalDeviceId, adapterId) => call(
        () => this.permitJoin.open(operationId, edgeHubLogicalDeviceId, adapterId),
        clearPermitJoinWindow,
      ),
      get: operationId => call(
        () => this.permitJoin.get(operationId), clearPermitJoinWindow,
      ),
      close: operationId => call(
        () => this.permitJoin.close(operationId), clearPermitJoinWindow,
      ),
      readRelay: operationId => call(
        () => this.permitJoin.readRelay(operationId), clearPermitJoinRelay,
      ),
      sendRelay: (operationId, exactFrame) => call(
        () => this.permitJoin.sendRelay(operationId, exactFrame),
        clearPermitJoinRelay,
      ),
    };
  }

  private accountAttachCheckpoints(
    context: DeviceV2AccountContext,
  ): EdgeGatewayAttachCheckpointStore {
    return {
      save: value => this.accountCheckpointOperation(
        context, () => this.checkpoints.save(value),
      ),
      load: operationId => this.accountCheckpointOperation(
        context, () => this.checkpoints.load(operationId),
      ),
      list: () => this.accountCheckpointOperation(
        context, () => this.checkpoints.list(),
      ),
      remove: operationId => this.accountCheckpointOperation(
        context, () => this.checkpoints.remove(operationId),
      ),
    };
  }

  private accountEnrollmentCheckpoints(
    context: DeviceV2AccountContext,
  ): EdgeGatewayEnrollmentCheckpointStore {
    return {
      save: value => this.accountCheckpointOperation(
        context, () => this.enrollmentCheckpoints.save(value),
      ),
      list: () => this.accountCheckpointOperation(
        context, () => this.enrollmentCheckpoints.list(),
      ),
      remove: logicalDeviceId => this.accountCheckpointOperation(
        context, () => this.enrollmentCheckpoints.remove(logicalDeviceId),
      ),
    };
  }

  private accountPermitJoinCheckpoints(
    context: DeviceV2AccountContext,
  ): EdgeGatewayPermitJoinCheckpointStore {
    return {
      save: value => this.accountCheckpointOperation(
        context, () => this.permitJoinCheckpoints.save(value),
      ),
      list: () => this.accountCheckpointOperation(
        context, () => this.permitJoinCheckpoints.list(),
      ),
      remove: operationId => this.accountCheckpointOperation(
        context, () => this.permitJoinCheckpoints.remove(operationId),
      ),
    };
  }

  private async accountCheckpointOperation<T>(
    context: DeviceV2AccountContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.assertAccount(context);
    const result = await operation();
    this.assertAccount(context);
    return result;
  }
}

function clearAttachResult(result: EdgeGatewayAttachResult): void {
  result.topology.operationId.fill(0);
  result.topology.childDeviceInstanceId.fill(0);
  result.topology.controllerId.fill(0);
  if (result.relay) {
    result.relay.grantId.fill(0);
    result.relay.controllerId.fill(0);
    result.relay.exactGrant.fill(0);
    result.relay.gatewaySecret.fill(0);
  }
  if (result.recovery) {
    result.recovery.grantId.fill(0);
    result.recovery.controllerId.fill(0);
    result.recovery.exactGrant.fill(0);
  }
}

function clearPermitJoinWindow(
  result: Awaited<ReturnType<EdgeGatewayPermitJoinApi['get']>>,
): void {
  result.operationId.fill(0);
}

function clearPermitJoinRelay(
  result: Awaited<ReturnType<EdgeGatewayPermitJoinApi['readRelay']>>,
): void {
  result.operationId.fill(0);
  result.relaySessionId.fill(0);
  result.candidateSnapshot?.fill(0);
  result.selectResult?.fill(0);
  result.downAck?.fill(0);
  result.upstreamBatch?.fill(0);
}

function randomOperationId(): Uint8Array {
  const operationId = new Uint8Array(16);
  do {
    crypto.getRandomValues(operationId);
  } while (!operationId.some(byte => byte !== 0));
  return operationId;
}
