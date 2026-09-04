import { EdgeGatewayTopologyState } from '../../protocol/device-v2';
import { BleDirectCrypto, constantTimeEqual } from '../ble-direct/crypto';
import {
  ControllerMutationReceipt,
  decodeControllerGrantV2,
  encodeControllerReceiptTranscript,
  sameBytes,
} from '../ble-direct/wire';
import {
  EdgeGatewayAttachApi,
  EdgeGatewayAttachRequest,
  EdgeGatewayAttachResult,
  EdgeGatewayRelay,
  EdgeGatewayRevocationRecovery,
  EdgeGatewayTopology,
} from './api';
import {
  EdgeGatewayAttachCheckpointStore,
} from './checkpoint-store';

export interface EdgeGatewayAdminControlSession {
  controlNonce: Uint8Array;
  install(exactGrant: Uint8Array, gatewaySecret: Uint8Array): Promise<ControllerMutationReceipt>;
  revoke(exactGrant: Uint8Array): Promise<ControllerMutationReceipt>;
}

export interface EdgeGatewayChildControl {
  withAdminControl<T>(
    childLogicalDeviceId: string,
    childDeviceInstanceId: Uint8Array,
    operation: (session: EdgeGatewayAdminControlSession) => Promise<T>,
  ): Promise<T>;
  confirmGatewayCredential(input: {
    childLogicalDeviceId: string;
    childDeviceInstanceId: Uint8Array;
    accessEpoch: number;
    controllerId: Uint8Array;
    credentialVersion: number;
    permissions: number;
    gatewaySecret: Uint8Array;
  }): Promise<void>;
}

export class EdgeGatewayAttachRelay {
  private readonly crypto = new BleDirectCrypto();

  constructor(
    private readonly api: EdgeGatewayAttachApi,
    private readonly checkpoints: EdgeGatewayAttachCheckpointStore,
    private readonly child: EdgeGatewayChildControl,
  ) {}

  async create(request: EdgeGatewayAttachRequest): Promise<EdgeGatewayAttachResult> {
    await this.checkpoints.save(request);
    const result = await this.api.create(request);
    await this.finishIfTerminal(request.operationId, result.topology);
    return result;
  }

  async resume(request: EdgeGatewayAttachRequest): Promise<EdgeGatewayAttachResult> {
    let result = await this.advanceCloud(request);
    if (result.topology.topologyState === EdgeGatewayTopologyState.PendingChildInstall) {
      result = await this.installOnChild(request, result.topology);
    }
    if (result.topology.topologyState === EdgeGatewayTopologyState.PendingGatewayProof) {
      result = await this.api.resume(request.operationId);
    }
    await this.finishIfTerminal(request.operationId, result.topology);
    return result;
  }

  async advanceCloud(request: EdgeGatewayAttachRequest): Promise<EdgeGatewayAttachResult> {
    // Reissuing create first closes the crash window between the successful
    // HTTP mutation and the App receiving its response. Idempotency-Key keeps
    // this a reconciliation, not a second topology operation.
    let result = await this.api.create(request);
    if (result.topology.topologyState === EdgeGatewayTopologyState.PendingAccessDelivery) {
      result = await this.api.resume(request.operationId);
    }
    await this.finishIfTerminal(request.operationId, result.topology);
    return result;
  }

  async cancel(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    const result = await this.api.cancel(operationId);
    await this.finishIfTerminal(operationId, result.topology);
    return result;
  }

  detach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    return this.api.detach(operationId);
  }

  async recoverDetach(operationId: Uint8Array): Promise<EdgeGatewayAttachResult> {
    let current = await this.api.get(operationId);
    if (current.topology.topologyState === EdgeGatewayTopologyState.Detached) {
      return current;
    }
    if (current.topology.topologyState !== EdgeGatewayTopologyState.Revoking) {
      throw new Error('EDGE_GATEWAY_RECOVERY_STATE_INVALID');
    }
    let recovery: EdgeGatewayRevocationRecovery | undefined;
    let receipt: ControllerMutationReceipt | undefined;
    try {
      await this.child.withAdminControl(
        current.topology.childLogicalDeviceId,
        current.topology.childDeviceInstanceId,
        async (control) => {
          current = await this.api.prepareRevocationRecovery(
            operationId, control.controlNonce,
          );
          recovery = current.recovery;
          if (!recovery) throw new Error('EDGE_GATEWAY_RECOVERY_GRANT_MISSING');
          this.validateRecovery(current.topology, recovery, control.controlNonce);
          receipt = await control.revoke(recovery.exactGrant);
          this.validateRecoveryReceipt(current.topology, recovery, receipt);
        },
      );
      if (!receipt) throw new Error('EDGE_GATEWAY_RECOVERY_RECEIPT_MISSING');
      return await this.api.confirmRevocationRecovery(operationId, receipt.encoded);
    } finally {
      if (recovery) clearRecovery(recovery);
      clearReceipt(receipt);
    }
  }

  private async installOnChild(
    request: EdgeGatewayAttachRequest,
    topology: EdgeGatewayTopology,
  ): Promise<EdgeGatewayAttachResult> {
    let relay: EdgeGatewayRelay | undefined;
    let receipt: ControllerMutationReceipt | undefined;
    let permissions = 0;
    try {
      await this.child.withAdminControl(
        request.childLogicalDeviceId,
        request.childDeviceInstanceId,
        async (control) => {
          const relayResult = await this.api.resume(request.operationId, control.controlNonce);
          relay = relayResult.relay;
          if (!relay) throw new Error('EDGE_GATEWAY_RELAY_MISSING');
          await this.validateRelay(request, topology, relay, control.controlNonce);
          const grant = decodeControllerGrantV2(relay.exactGrant);
          permissions = grant.permissions;
          clearGrant(grant);
          receipt = await control.install(relay.exactGrant, relay.gatewaySecret);
          await this.validateReceipt(topology, relay, receipt);
        },
      );
      if (!relay || !receipt) throw new Error('EDGE_GATEWAY_CHILD_INSTALL_INCOMPLETE');
      // The Admin control connection is closed before this second Method 2
      // connection, proving that the newly installed Gateway credential can
      // independently establish a DirectSecure application record.
      await this.child.confirmGatewayCredential({
        childLogicalDeviceId: request.childLogicalDeviceId,
        childDeviceInstanceId: request.childDeviceInstanceId,
        accessEpoch: topology.accessEpoch,
        controllerId: relay.controllerId,
        credentialVersion: relay.credentialVersion,
        permissions,
        gatewaySecret: relay.gatewaySecret,
      });
      return await this.api.confirmReceipt(request.operationId, receipt.encoded);
    } finally {
      if (relay) clearRelay(relay);
      clearReceipt(receipt);
    }
  }

  private async validateRelay(
    request: EdgeGatewayAttachRequest,
    topology: EdgeGatewayTopology,
    relay: EdgeGatewayRelay,
    controlNonce: Uint8Array,
  ): Promise<void> {
    const grant = decodeControllerGrantV2(relay.exactGrant);
    const digest = await this.crypto.sha256(relay.gatewaySecret);
    try {
      if (grant.operation !== relay.operation
        || !sameBytes(grant.grantId, relay.grantId)
        || !sameBytes(grant.deviceInstanceId, request.childDeviceInstanceId)
        || grant.accessEpoch !== topology.accessEpoch
        || !sameBytes(grant.controllerId, topology.controllerId)
        || !sameBytes(grant.controllerId, relay.controllerId)
        || grant.credentialVersion !== topology.credentialVersion
        || grant.credentialVersion !== relay.credentialVersion
        || grant.permissions !== 3
        || !sameBytes(grant.secretDigest, digest)
        || !sameBytes(grant.controlNonce, controlNonce)
        || relay.expiresAt !== topology.credentialExpiresAt) {
        throw new Error('EDGE_GATEWAY_RELAY_CONTEXT_MISMATCH');
      }
    } finally {
      digest.fill(0);
      clearGrant(grant);
    }
  }

  private async validateReceipt(
    topology: EdgeGatewayTopology,
    relay: EdgeGatewayRelay,
    receipt: ControllerMutationReceipt,
  ): Promise<void> {
    const expected = await this.crypto.hmac(
      relay.gatewaySecret, encodeControllerReceiptTranscript(receipt),
    );
    try {
      if (receipt.operation !== relay.operation
        || !sameBytes(receipt.grantId, relay.grantId)
        || !sameBytes(receipt.deviceInstanceId, topology.childDeviceInstanceId)
        || receipt.accessEpoch !== topology.accessEpoch
        || !sameBytes(receipt.controllerId, relay.controllerId)
        || receipt.credentialVersion !== relay.credentialVersion
        || receipt.permissions !== 3 || receipt.proofKind !== 1
        || !constantTimeEqual(receipt.proof, expected)) {
        throw new Error('EDGE_GATEWAY_RECEIPT_CONTEXT_MISMATCH');
      }
    } finally {
      expected.fill(0);
    }
  }

  private validateRecovery(
    topology: EdgeGatewayTopology,
    recovery: EdgeGatewayRevocationRecovery,
    controlNonce: Uint8Array,
  ): void {
    const grant = decodeControllerGrantV2(recovery.exactGrant);
    try {
      if (grant.operation !== 3 || recovery.operation !== 3
        || !sameBytes(grant.grantId, recovery.grantId)
        || !sameBytes(grant.deviceInstanceId, topology.childDeviceInstanceId)
        || grant.accessEpoch !== topology.accessEpoch
        || !sameBytes(grant.controllerId, topology.controllerId)
        || !sameBytes(grant.controllerId, recovery.controllerId)
        || grant.expectedCredentialVersion !== topology.credentialVersion
        || grant.credentialVersion !== topology.credentialVersion
        || grant.credentialVersion !== recovery.credentialVersion
        || grant.permissions !== 0
        || grant.secretDigest.some(byte => byte !== 0)
        || !sameBytes(grant.controlNonce, controlNonce)) {
        throw new Error('EDGE_GATEWAY_RECOVERY_CONTEXT_MISMATCH');
      }
    } finally {
      clearGrant(grant);
    }
  }

  private validateRecoveryReceipt(
    topology: EdgeGatewayTopology,
    recovery: EdgeGatewayRevocationRecovery,
    receipt: ControllerMutationReceipt,
  ): void {
    if (receipt.operation !== 3
      || !sameBytes(receipt.grantId, recovery.grantId)
      || !sameBytes(receipt.deviceInstanceId, topology.childDeviceInstanceId)
      || receipt.accessEpoch !== topology.accessEpoch
      || !sameBytes(receipt.controllerId, recovery.controllerId)
      || receipt.credentialVersion !== recovery.credentialVersion
      || receipt.permissions !== 0
      || receipt.secretDigest.some(byte => byte !== 0)
      || receipt.proofKind !== 0 || receipt.proof.length !== 0) {
      throw new Error('EDGE_GATEWAY_RECOVERY_RECEIPT_MISMATCH');
    }
  }

  private async finishIfTerminal(
    operationId: Uint8Array,
    topology: EdgeGatewayTopology,
  ): Promise<void> {
    if (topology.topologyState === EdgeGatewayTopologyState.Active
      || topology.topologyState === EdgeGatewayTopologyState.Expired
      || topology.topologyState === EdgeGatewayTopologyState.Cancelled
      || topology.topologyState === EdgeGatewayTopologyState.Detached) {
      await this.checkpoints.remove(operationId);
    }
  }
}

function clearRelay(value: EdgeGatewayRelay): void {
  value.grantId.fill(0);
  value.controllerId.fill(0);
  value.exactGrant.fill(0);
  value.gatewaySecret.fill(0);
}
function clearRecovery(value: EdgeGatewayRevocationRecovery): void {
  value.grantId.fill(0);
  value.controllerId.fill(0);
  value.exactGrant.fill(0);
}
function clearReceipt(value?: ControllerMutationReceipt): void {
  if (!value) return;
  value.encoded.fill(0);
  value.grantId.fill(0);
  value.deviceInstanceId.fill(0);
  value.controllerId.fill(0);
  value.secretDigest.fill(0);
  value.proof.fill(0);
}
function clearGrant(value: ReturnType<typeof decodeControllerGrantV2>): void {
  value.grantId.fill(0);
  value.deviceInstanceId.fill(0);
  value.controllerId.fill(0);
  value.secretDigest.fill(0);
  value.controlNonce.fill(0);
  value.signature.fill(0);
}
