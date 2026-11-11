import { AccessRegistrationApi, AccessRegistrationRequest, sameIntent } from './access-registration-api';
import { AccessRegistrationCheckpoint, AccessRegistrationCheckpoints, snapshotCheckpoint } from './access-registration-checkpoints';
import { AccessRegistrationIntent, accessRegistrationRootTuple, validateAccessRegistrationIntent } from './access-registration-contract';
import { BleDirectClient } from './client';
import { CapacitorBleControllerCredentialStore } from './credential-store';
import { BleDirectCrypto } from './crypto';
import { BleDirectTarget } from './transport';
import { base64UrlDecode, base64UrlEncode } from './wire';
import type { BleDirectSession } from './session';
import { GatewayHttpError } from '../../model/response.model';

type References = Pick<CapacitorBleControllerCredentialStore, 'prepareAccessRegistrationReference'
  | 'confirmAccessRegistrationReference' | 'retireAccessRegistrationReference' | 'invalidateRootReferences'>;
export interface AccessRegistrationOutcome {
  intent: AccessRegistrationIntent;
  localReferencePending: boolean;
  presenceSetupPending?: boolean;
}
export type AccessRegistrationPresenceSetup = (intent: AccessRegistrationIntent,
  session: BleDirectSession, signal: AbortSignal) => Promise<void>;

// Ports only: the original BleService must provide its radio owner/admission
// context. This coordinator never scans, constructs a transport or retries.
export class AccessRegistrationCoordinator {
  constructor(private readonly api: AccessRegistrationApi, private readonly references: References,
    private readonly client: Pick<BleDirectClient, 'authenticateAccessRegistration'>,
    private readonly checkpoints: AccessRegistrationCheckpoints, private readonly assertCurrent: () => void,
    private readonly crypto = new BleDirectCrypto(), private readonly setupPresence?: AccessRegistrationPresenceSetup) {}

  async begin(request: AccessRegistrationRequest, target: BleDirectTarget, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    this.check(signal);
    if (await this.checkpoints.load(request.requestId)) throw Error('ACCESS_REGISTRATION_RECOVERY_REQUIRED');
    this.check(signal);
    let checkpoint = snapshotCheckpoint({ request, commitId: base64UrlEncode(this.crypto.random(16)), phase: 'preparing' });
    await this.checkpoints.save(checkpoint); this.check(signal);
    let intent: AccessRegistrationIntent;
    try { intent = await this.api.prepare(checkpoint.request, signal); }
    catch (error) {
      // The repository replays an existing intent before this exact guard;
      // this response is only possible before new intent/reservation writes.
      if (error instanceof GatewayHttpError && error.httpStatus === 409
        && error.code === 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING') {
        this.check(signal);
        await this.checkpoints.save({ ...checkpoint, phase: 'rejected', localReferencePending: false,
          prepareRejection: { httpStatus: 409, code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING' } });
        this.check(signal);
      } else await this.unknown(checkpoint, 'prepare', signal);
      throw error;
    }
    this.check(signal); this.matchRequest(checkpoint, intent);
    checkpoint = { ...checkpoint, intent, phase: 'prepared' };
    await this.checkpoints.save(checkpoint); this.check(signal);
    return this.complete(checkpoint, target, signal);
  }

  // Explicit user continuation only. Foreground visibility must not call it.
  async resumePrepared(requestId: string, target: BleDirectTarget, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    this.check(signal); const checkpoint = await this.required(requestId); this.check(signal);
    if (checkpoint.phase !== 'prepared' || checkpoint.intent?.state !== 'prepared') throw Error('ACCESS_REGISTRATION_RECOVERY_REQUIRED');
    return this.complete(checkpoint, target, signal);
  }

  async recover(requestId: string, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    this.check(signal); const checkpoint = await this.required(requestId); this.check(signal);
    if (checkpoint.phase === 'rejected') throw Error('ACCESS_REGISTRATION_PREPARE_REJECTED');
    const intent = await this.api.read(requestId, signal); this.check(signal); this.matchRequest(checkpoint, intent);
    if (checkpoint.intent && !sameIntent(checkpoint.intent, intent)) throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
    const pending: AccessRegistrationCheckpoint = { ...checkpoint, intent,
      localReferencePending: true,
      phase: intent.state === 'committed' ? 'committed' : intent.state === 'prepared'
        ? (checkpoint.phase === 'preparing' || checkpoint.unknownOperation === 'prepare' ? 'prepared' : checkpoint.phase) : 'closed' };
    await this.checkpoints.save(pending); this.check(signal);
    if (intent.state === 'committed') return this.settle(pending, intent, signal);
    if (intent.state !== 'prepared') {
      if (intent.state === 'invalidated') {
        await this.references.invalidateRootReferences(intent.rootBindingId); this.check(signal);
      }
      await this.references.retireAccessRegistrationReference(intent.targetLogicalDeviceId, intent.intentId); this.check(signal);
      await this.checkpoints.save({ ...pending, localReferencePending: false }); this.check(signal);
    }
    return { intent, localReferencePending: false };
  }

  async cancelPrepared(requestId: string, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    this.check(signal); const checkpoint = await this.required(requestId); this.check(signal);
    if (checkpoint.phase !== 'prepared') throw Error('ACCESS_REGISTRATION_RECOVERY_REQUIRED');
    let intent: AccessRegistrationIntent;
    try { intent = await this.api.cancel(requestId, signal); }
    catch (error) { await this.unknown(checkpoint, 'cancel', signal); throw error; }
    this.check(signal); this.matchRequest(checkpoint, intent);
    await this.checkpoints.save({ ...checkpoint, intent, phase: 'closed', localReferencePending: true }); this.check(signal);
    if (intent.state === 'invalidated') { await this.references.invalidateRootReferences(intent.rootBindingId); this.check(signal); }
    await this.references.retireAccessRegistrationReference(intent.targetLogicalDeviceId, intent.intentId); this.check(signal);
    await this.checkpoints.save({ ...checkpoint, intent, phase: 'closed', localReferencePending: false }); this.check(signal);
    return { intent, localReferencePending: false };
  }

  async clearResolved(requestId: string, signal: AbortSignal): Promise<void> {
    this.check(signal); await this.checkpoints.removeTerminal(requestId); this.check(signal);
  }

  private async complete(value: AccessRegistrationCheckpoint, target: BleDirectTarget, signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    const checkpoint = snapshotCheckpoint(value), intent = checkpoint.intent!;
    this.check(signal);
    if (intent.state !== 'prepared' || Date.now() >= intent.expiresAt) throw Error('ACCESS_REGISTRATION_CLOSED');
    await this.references.prepareAccessRegistrationReference({ sourceLogicalDeviceId: intent.sourceLogicalDeviceId,
      targetLogicalDeviceId: intent.targetLogicalDeviceId, rootBindingId: intent.rootBindingId,
      bindingRevision: intent.bindingRevision, intentId: intent.intentId, commitId: base64UrlDecode(checkpoint.commitId, 16),
      expectedRoot: intent.expectedRoot }); this.check(signal);
    const authenticated = await this.client.authenticateAccessRegistration(intent, target, this.assertCurrent, signal);
    try {
      this.check(signal);
      const confirming: AccessRegistrationCheckpoint = { ...checkpoint, phase: 'confirming',
        confirmationDigest: authenticated.confirmationDigest };
      await this.checkpoints.save(confirming); this.check(signal);
      let committed: AccessRegistrationIntent;
      try { committed = await this.api.commit(intent, checkpoint.commitId, authenticated.confirmationDigest, signal); }
      catch (error) { await this.unknown(confirming, 'commit', signal); throw error; }
      this.check(signal); this.matchRequest(checkpoint, committed);
      if (committed.state !== 'committed') throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
      await this.checkpoints.save({ ...confirming, intent: committed, phase: 'committed', localReferencePending: true }); this.check(signal);
      // Keep this freshly authenticated session alive until local activation
      // finishes. A confirmed registration is not undone by presence setup.
      const outcome = await this.settle(confirming, committed, signal);
      if (outcome.localReferencePending || committed.device?.state !== 'active' || !this.setupPresence) return outcome;
      try {
        this.check(signal);
        await this.setupPresence(committed, authenticated.session, signal);
        this.check(signal);
        return outcome;
      } catch {
        this.check(signal);
        return { ...outcome, presenceSetupPending: true };
      }
    } finally { await authenticated.session.close().catch(() => undefined); }
  }

  private async settle(checkpoint: AccessRegistrationCheckpoint, intent: AccessRegistrationIntent,
    signal: AbortSignal): Promise<AccessRegistrationOutcome> {
    try {
      this.check(signal);
      if (intent.device?.state !== 'active') {
        await this.references.retireAccessRegistrationReference(intent.targetLogicalDeviceId, intent.intentId);
      } else {
        try { await this.references.confirmAccessRegistrationReference(intent.targetLogicalDeviceId, intent.intentId); }
        catch (error) {
          this.check(signal);
          if (!(error instanceof Error) || error.message !== 'BLE_DIRECT_CREDENTIAL_NOT_FOUND') throw error;
          // Repair only an absent local write. Existing root refs remain valid
          // even when the original source card was removed after commit.
          await this.references.prepareAccessRegistrationReference({ sourceLogicalDeviceId: intent.sourceLogicalDeviceId,
            targetLogicalDeviceId: intent.targetLogicalDeviceId, rootBindingId: intent.rootBindingId,
            bindingRevision: intent.bindingRevision, intentId: intent.intentId, commitId: base64UrlDecode(checkpoint.commitId, 16),
            expectedRoot: intent.expectedRoot }); this.check(signal);
          await this.references.confirmAccessRegistrationReference(intent.targetLogicalDeviceId, intent.intentId);
        }
      }
      this.check(signal);
      await this.checkpoints.save({ ...checkpoint, intent, phase: 'committed', localReferencePending: false }); this.check(signal);
      return { intent, localReferencePending: false };
    } catch {
      this.check(signal); return { intent, localReferencePending: true };
    }
  }
  private async unknown(checkpoint: AccessRegistrationCheckpoint, operation: 'prepare' | 'commit' | 'cancel', signal: AbortSignal): Promise<void> {
    // If the owner was retired, the previous durable phase already preserves
    // the unresolved request; never write into the replacement context.
    this.check(signal);
    await this.checkpoints.save({ ...checkpoint, phase: 'unknown', unknownOperation: operation }); this.check(signal);
  }
  private async required(id: string): Promise<AccessRegistrationCheckpoint> {
    const value = await this.checkpoints.load(id); if (!value) throw Error('ACCESS_REGISTRATION_CHECKPOINT_NOT_FOUND');
    return snapshotCheckpoint(value);
  }
  private matchRequest(checkpoint: AccessRegistrationCheckpoint, intent: AccessRegistrationIntent): void {
    validateAccessRegistrationIntent(intent);
    if (intent.intentId !== checkpoint.request.requestId || intent.sourceLogicalDeviceId !== checkpoint.request.sourceLogicalDeviceId
      || (checkpoint.intent !== undefined && !sameIntent(checkpoint.intent, intent))
      || JSON.stringify(accessRegistrationRootTuple(intent.expectedRoot)) !== JSON.stringify(accessRegistrationRootTuple(checkpoint.request.expectedRoot)))
      throw Error('ACCESS_REGISTRATION_RESPONSE_CONTEXT_INVALID');
  }
  private check(signal: AbortSignal): void {
    if (signal.aborted) throw signal.reason ?? Error('ACCESS_REGISTRATION_CANCELLED'); this.assertCurrent();
  }
}
