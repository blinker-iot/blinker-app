import { describe, expect, it, vi } from 'vitest';

import {
  EdgeGatewayTopologyState,
  encodeCanonicalArray,
  encodeCanonicalByteString,
  encodeCanonicalUnsigned,
} from '../../protocol/device-v2';
import { BleDirectCrypto } from '../ble-direct/crypto';
import {
  ControllerMutationOperation,
  ControllerMutationReceipt,
  encodeControllerMutationReceipt,
  encodeControllerReceiptTranscript,
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
  EdgeGatewayAttachCheckpoint,
  EdgeGatewayAttachCheckpointStore,
} from './checkpoint-store';
import {
  EdgeGatewayAdminControlSession,
  EdgeGatewayAttachRelay,
  EdgeGatewayChildControl,
} from './relay';

const cryptoPort = new BleDirectCrypto();
const bytes = (value: number, size: number) => new Uint8Array(size).fill(value);

function topology(state: EdgeGatewayTopologyState): EdgeGatewayTopology {
  return {
    operationId: bytes(0x11, 16),
    edgeHubLogicalDeviceId: 'device_hub',
    childLogicalDeviceId: 'ble_child',
    childDeviceInstanceId: bytes(0x12, 16),
    accessEpoch: 3,
    controllerId: bytes(0x13, 16),
    credentialVersion: 1,
    presenceKeyVersion: 2,
    topologyVersion: state >= EdgeGatewayTopologyState.PendingGatewayProof ? 2 : 1,
    topologyState: state,
    credentialExpiresAt: 9_000_000,
    deliveryExpiresAt: 2_000_000,
    edgeHubStored: true,
    childInstalled: state >= EdgeGatewayTopologyState.PendingGatewayProof,
    gatewayProven: state === EdgeGatewayTopologyState.Active,
    updatedAt: 1_000_000,
    replayed: false,
  };
}

function exactGrant(controlNonce: Uint8Array, secretDigest: Uint8Array): Uint8Array {
  return encodeCanonicalArray([
    encodeCanonicalUnsigned(2),
    encodeCanonicalUnsigned(ControllerMutationOperation.Install),
    encodeCanonicalByteString(bytes(0x14, 16)),
    encodeCanonicalByteString(bytes(0x12, 16)),
    encodeCanonicalUnsigned(3),
    encodeCanonicalByteString(bytes(0x13, 16)),
    encodeCanonicalUnsigned(0),
    encodeCanonicalUnsigned(1),
    encodeCanonicalUnsigned(3),
    encodeCanonicalByteString(secretDigest),
    encodeCanonicalByteString(controlNonce),
    encodeCanonicalUnsigned(1),
    encodeCanonicalUnsigned(2),
    encodeCanonicalByteString(bytes(0x15, 64)),
  ]);
}

function exactRevokeGrant(controlNonce: Uint8Array): Uint8Array {
  return encodeCanonicalArray([
    encodeCanonicalUnsigned(2),
    encodeCanonicalUnsigned(ControllerMutationOperation.Revoke),
    encodeCanonicalByteString(bytes(0x14, 16)),
    encodeCanonicalByteString(bytes(0x12, 16)),
    encodeCanonicalUnsigned(3),
    encodeCanonicalByteString(bytes(0x13, 16)),
    encodeCanonicalUnsigned(1),
    encodeCanonicalUnsigned(1),
    encodeCanonicalUnsigned(0),
    encodeCanonicalByteString(new Uint8Array(32)),
    encodeCanonicalByteString(controlNonce),
    encodeCanonicalUnsigned(1),
    encodeCanonicalUnsigned(2),
    encodeCanonicalByteString(bytes(0x15, 64)),
  ]);
}

class MemoryCheckpoints implements EdgeGatewayAttachCheckpointStore {
  value?: EdgeGatewayAttachCheckpoint;
  async save(value: EdgeGatewayAttachCheckpoint): Promise<void> { this.value = value; }
  async load(): Promise<EdgeGatewayAttachCheckpoint | undefined> { return this.value; }
  async list(): Promise<EdgeGatewayAttachCheckpoint[]> { return this.value ? [this.value] : []; }
  async remove(): Promise<void> { this.value = undefined; }
}

describe('Edge Gateway exact App relay', () => {
  it.each(['advanceCloud', 'resume'] as const)('polls pending Gateway proof once without child control in %s', async method => {
    const request: EdgeGatewayAttachRequest = {
      operationId: bytes(0x11, 16), edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'ble_child', childDeviceInstanceId: bytes(0x12, 16),
    };
    const child = { withAdminControl: vi.fn(), confirmGatewayCredential: vi.fn() };
    const pending = { topology: topology(EdgeGatewayTopologyState.PendingGatewayProof) };
    const api = { create: vi.fn().mockResolvedValue(pending), resume: vi.fn().mockResolvedValue(pending) };
    const checkpoints = new MemoryCheckpoints();
    await checkpoints.save(request);
    const relay = new EdgeGatewayAttachRelay(api as any, checkpoints, child);
    await expect(relay[method](request)).resolves.toBe(pending);
    expect(api.resume).toHaveBeenCalledOnce();
    expect(child.withAdminControl).not.toHaveBeenCalled();
    expect(checkpoints.value).toBe(request);
  });

  it('rejects a topology bound to another Hub before opening child control', async () => {
    const request: EdgeGatewayAttachRequest = {
      operationId: bytes(0x11, 16),
      edgeHubLogicalDeviceId: 'device_hub_b',
      childLogicalDeviceId: 'ble_child',
      childDeviceInstanceId: bytes(0x12, 16),
    };
    const response = topology(EdgeGatewayTopologyState.PendingChildInstall);
    const child: EdgeGatewayChildControl = {
      withAdminControl: vi.fn(),
      confirmGatewayCredential: vi.fn(),
    };
    const api: EdgeGatewayAttachApi = {
      create: vi.fn(async () => ({ topology: response })),
      get: vi.fn(),
      resume: vi.fn(),
      confirmReceipt: vi.fn(),
      cancel: vi.fn(),
      detach: vi.fn(),
      prepareRevocationRecovery: vi.fn(),
      confirmRevocationRecovery: vi.fn(),
    };

    await expect(new EdgeGatewayAttachRelay(
      api, new MemoryCheckpoints(), child,
    ).resume(request)).rejects.toThrow('EDGE_GATEWAY_TOPOLOGY_CONTEXT_MISMATCH');

    expect(child.withAdminControl).not.toHaveBeenCalled();
    expect(child.confirmGatewayCredential).not.toHaveBeenCalled();
    expect(response.operationId).toEqual(new Uint8Array(16));
    expect(response.childDeviceInstanceId).toEqual(new Uint8Array(16));
    expect(response.controllerId).toEqual(new Uint8Array(16));
  });

  it('advances Hub secret delivery without opening a child session', async () => {
    const request: EdgeGatewayAttachRequest = {
      operationId: bytes(0x11, 16),
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'ble_child',
      childDeviceInstanceId: bytes(0x12, 16),
    };
    const child: EdgeGatewayChildControl = {
      withAdminControl: vi.fn(),
      confirmGatewayCredential: vi.fn(),
    };
    const api: EdgeGatewayAttachApi = {
      create: vi.fn(async () => ({
        topology: topology(EdgeGatewayTopologyState.PendingAccessDelivery),
      })),
      get: vi.fn(),
      resume: vi.fn(async () => ({
        topology: topology(EdgeGatewayTopologyState.PendingChildInstall),
      })),
      confirmReceipt: vi.fn(),
      cancel: vi.fn(),
      detach: vi.fn(),
      prepareRevocationRecovery: vi.fn(),
      confirmRevocationRecovery: vi.fn(),
    };

    const result = await new EdgeGatewayAttachRelay(
      api, new MemoryCheckpoints(), child,
    ).advanceCloud(request);

    expect(result.topology.topologyState)
      .toBe(EdgeGatewayTopologyState.PendingChildInstall);
    expect(child.withAdminControl).not.toHaveBeenCalled();
    expect(child.confirmGatewayCredential).not.toHaveBeenCalled();
  });

  it('resumes after App kill and commits only after independent Gateway Method 2', async () => {
    const request: EdgeGatewayAttachRequest = {
      operationId: bytes(0x11, 16),
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'ble_child',
      childDeviceInstanceId: bytes(0x12, 16),
    };
    const gatewaySecret = bytes(0x21, 32);
    const controlNonce = bytes(0x22, 16);
    const secretDigest = await cryptoPort.sha256(gatewaySecret);
    const relayPackage: EdgeGatewayRelay = {
      operation: 1,
      grantId: bytes(0x14, 16),
      controllerId: bytes(0x13, 16),
      credentialVersion: 1,
      expiresAt: 9_000_000,
      exactGrant: exactGrant(controlNonce, secretDigest),
      gatewaySecret: gatewaySecret.slice(),
    };
    let method2Confirmed = false;
    let adminOpen = false;
    const confirmReceipt = vi.fn(async (): Promise<EdgeGatewayAttachResult> => {
      expect(method2Confirmed).toBe(true);
      return { topology: topology(EdgeGatewayTopologyState.PendingGatewayProof) };
    });
    const api: EdgeGatewayAttachApi = {
      create: vi.fn(async () => ({
        topology: topology(EdgeGatewayTopologyState.PendingChildInstall),
      })),
      get: vi.fn(),
      resume: vi.fn(async (_operationId, nonce) => nonce
        ? { topology: topology(EdgeGatewayTopologyState.PendingChildInstall), relay: relayPackage }
        : { topology: topology(EdgeGatewayTopologyState.Active) }),
      confirmReceipt,
      cancel: vi.fn(),
      detach: vi.fn(),
      prepareRevocationRecovery: vi.fn(),
      confirmRevocationRecovery: vi.fn(),
    };
    const child: EdgeGatewayChildControl = {
      async withAdminControl<T>(
        _logicalDeviceId: string,
        _deviceInstanceId: Uint8Array,
        operation: (session: EdgeGatewayAdminControlSession) => Promise<T>,
      ): Promise<T> {
        adminOpen = true;
        try {
          return await operation({
            controlNonce,
            async install(_grant, secret): Promise<ControllerMutationReceipt> {
              expect(adminOpen).toBe(true);
              const receipt: ControllerMutationReceipt = {
                encoded: new Uint8Array(),
                operation: ControllerMutationOperation.Install,
                grantId: bytes(0x14, 16),
                deviceInstanceId: bytes(0x12, 16),
                accessEpoch: 3,
                controllerId: bytes(0x13, 16),
                credentialVersion: 1,
                permissions: 3,
                secretDigest: await cryptoPort.sha256(secret),
                proofKind: 1,
                proof: new Uint8Array(32),
              };
              receipt.proof = await cryptoPort.hmac(
                secret, encodeControllerReceiptTranscript(receipt),
              );
              receipt.encoded = encodeControllerMutationReceipt(receipt);
              return receipt;
            },
            revoke: vi.fn(),
          });
        } finally {
          adminOpen = false;
        }
      },
      async confirmGatewayCredential(input): Promise<void> {
        expect(adminOpen).toBe(false);
        expect(input.gatewaySecret).toEqual(gatewaySecret);
        method2Confirmed = true;
      },
    };
    const checkpoints = new MemoryCheckpoints();
    const firstProcess = new EdgeGatewayAttachRelay(api, checkpoints, child);
    await firstProcess.create(request);
    expect(checkpoints.value).toBe(request);

    // A new object models WebView process death; only the non-secret
    // checkpoint survives. create() is replayed with the same operation id.
    const restarted = new EdgeGatewayAttachRelay(api, checkpoints, child);
    const result = await restarted.resume(request);

    expect(result.topology.topologyState).toBe(EdgeGatewayTopologyState.Active);
    expect(confirmReceipt).toHaveBeenCalledOnce();
    expect(checkpoints.value).toBeUndefined();
    expect(relayPackage.gatewaySecret.every(byte => byte === 0)).toBe(true);
    expect(relayPackage.exactGrant.every(byte => byte === 0)).toBe(true);
    secretDigest.fill(0);
    gatewaySecret.fill(0);
  });

  it.each(['proof', 'secretDigest'] as const)('rejects receipt %s before Method 2/commit', async field => {
    const request: EdgeGatewayAttachRequest = {
      operationId: bytes(0x11, 16),
      edgeHubLogicalDeviceId: 'device_hub',
      childLogicalDeviceId: 'ble_child',
      childDeviceInstanceId: bytes(0x12, 16),
    };
    const secret = bytes(0x31, 32);
    const nonce = bytes(0x32, 16);
    const digest = await cryptoPort.sha256(secret);
    const relayPackage: EdgeGatewayRelay = {
      operation: 1,
      grantId: bytes(0x14, 16),
      controllerId: bytes(0x13, 16),
      credentialVersion: 1,
      expiresAt: 9_000_000,
      exactGrant: exactGrant(nonce, digest),
      gatewaySecret: secret,
    };
    const confirmReceipt = vi.fn();
    const api: EdgeGatewayAttachApi = {
      create: vi.fn(async () => ({ topology: topology(EdgeGatewayTopologyState.PendingChildInstall) })),
      get: vi.fn(),
      resume: vi.fn(async () => ({
        topology: topology(EdgeGatewayTopologyState.PendingChildInstall), relay: relayPackage,
      })),
      confirmReceipt,
      cancel: vi.fn(),
      detach: vi.fn(),
      prepareRevocationRecovery: vi.fn(),
      confirmRevocationRecovery: vi.fn(),
    };
    const child: EdgeGatewayChildControl = {
      async withAdminControl(_logical, _instance, operation) {
        return operation({
          controlNonce: nonce,
          async install() {
            const receipt: ControllerMutationReceipt = {
              encoded: new Uint8Array(),
              operation: 1,
              grantId: bytes(0x14, 16),
              deviceInstanceId: bytes(0x12, 16),
              accessEpoch: 3,
              controllerId: bytes(0x13, 16),
              credentialVersion: 1,
              permissions: 3,
              secretDigest: digest.slice(),
              proofKind: 1,
              proof: new Uint8Array(32),
            };
            if (field === 'secretDigest') receipt.secretDigest[0] ^= 1;
            receipt.proof = await cryptoPort.hmac(
              secret, encodeControllerReceiptTranscript(receipt),
            );
            if (field === 'proof') receipt.proof[0] ^= 1;
            receipt.encoded = encodeControllerMutationReceipt(receipt);
            return receipt;
          },
          revoke: vi.fn(),
        });
      },
      confirmGatewayCredential: vi.fn(),
    };
    const relay = new EdgeGatewayAttachRelay(api, new MemoryCheckpoints(), child);

    await expect(relay.resume(request)).rejects.toThrow('EDGE_GATEWAY_RECEIPT_CONTEXT_MISMATCH');
    expect(child.confirmGatewayCredential).not.toHaveBeenCalled();
    expect(confirmReceipt).not.toHaveBeenCalled();
    expect(relayPackage.gatewaySecret.every(byte => byte === 0)).toBe(true);
    expect(relayPackage.exactGrant.every(byte => byte === 0)).toBe(true);
    digest.fill(0);
  });

  it('recovers a pre-tombstone revoke through the existing Admin session', async () => {
    const nonce = bytes(0x52, 16);
    const recovery: EdgeGatewayRevocationRecovery = {
      operation: ControllerMutationOperation.Revoke,
      grantId: bytes(0x14, 16),
      controllerId: bytes(0x13, 16),
      credentialVersion: 1,
      expiresAt: 2_000_000,
      exactGrant: exactRevokeGrant(nonce),
    };
    const revoking = topology(EdgeGatewayTopologyState.Revoking);
    const detached = topology(EdgeGatewayTopologyState.Detached);
    const confirm = vi.fn(async (): Promise<EdgeGatewayAttachResult> => ({
      topology: detached,
    }));
    const api: EdgeGatewayAttachApi = {
      create: vi.fn(),
      get: vi.fn(async () => ({ topology: revoking })),
      resume: vi.fn(),
      confirmReceipt: vi.fn(),
      cancel: vi.fn(),
      detach: vi.fn(),
      prepareRevocationRecovery: vi.fn(async () => ({
        topology: revoking,
        recovery,
      })),
      confirmRevocationRecovery: confirm,
    };
    const child: EdgeGatewayChildControl = {
      async withAdminControl(_logical, _instance, operation) {
        return operation({
          controlNonce: nonce,
          install: vi.fn(),
          async revoke(): Promise<ControllerMutationReceipt> {
            const receipt: ControllerMutationReceipt = {
              encoded: new Uint8Array(),
              operation: ControllerMutationOperation.Revoke,
              grantId: bytes(0x14, 16),
              deviceInstanceId: bytes(0x12, 16),
              accessEpoch: 3,
              controllerId: bytes(0x13, 16),
              credentialVersion: 1,
              permissions: 0,
              secretDigest: new Uint8Array(32),
              proofKind: 0,
              proof: new Uint8Array(),
            };
            receipt.encoded = encodeControllerMutationReceipt(receipt);
            return receipt;
          },
        });
      },
      confirmGatewayCredential: vi.fn(),
    };
    const relay = new EdgeGatewayAttachRelay(
      api, new MemoryCheckpoints(), child,
    );

    const result = await relay.recoverDetach(revoking.operationId);

    expect(result.topology.topologyState).toBe(EdgeGatewayTopologyState.Detached);
    expect(confirm).toHaveBeenCalledOnce();
    expect(recovery.exactGrant.every(byte => byte === 0)).toBe(true);
  });
});
