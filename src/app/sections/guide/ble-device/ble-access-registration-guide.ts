import type { AccessRegistrationCheckpoint } from '../../../core/device-v2/ble-direct/access-registration-checkpoints';
import type { AccessRegistrationOutcome } from '../../../core/device-v2/ble-direct/access-registration-coordinator';
import type { BleDirectTarget } from '../../../core/device-v2/ble-direct';
import type { DeviceV2BleService } from '../../../core/services/device-v2-ble.service';

type RegistrationPort = Pick<DeviceV2BleService, 'accessRegistrationSources' | 'accessRegistrationCheckpoints'
  | 'discoverAccessRegistrationTargets' | 'beginAccessRegistration' | 'continueAccessRegistration'
  | 'recoverAccessRegistration' | 'cancelAccessRegistration' | 'clearAccessRegistration'>;
type Source = { logicalDeviceId: string; displayName: string };

// View state only. Auth, radio admission, storage and writes remain owned by
// the original service/coordinator. Lifecycle never calls a remote recovery.
export class BleAccessRegistrationGuide {
  sources: Source[] = [];
  records: AccessRegistrationCheckpoint[] = [];
  targets: BleDirectTarget[] = [];
  phase: 'idle' | 'discovering' | 'selecting' | 'registering' | 'recovering' = 'idle';
  noticeKey = '';
  errorKey = '';
  presenceSetupPending = false;
  private generation = 0;
  private abort?: AbortController;
  private selectionAbort?: AbortController;
  private selection?: { sourceId: string; requestId?: string };

  constructor(private readonly port: RegistrationPort, private readonly available: () => boolean,
    private readonly changed: () => void, private readonly confirmed: (id: string) => void) {}

  get busy(): boolean { return ['discovering', 'registering', 'recovering'].includes(this.phase); }

  async loadLocal(): Promise<void> {
    if (!this.available() || this.busy) return;
    await this.readLocal(this.generation);
  }

  async selectSource(source: Source): Promise<void> {
    if (!this.sources.some(item => item.logicalDeviceId === source.logicalDeviceId)
      || this.sourceBlocked(source.logicalDeviceId)) return;
    await this.discover({ sourceId: source.logicalDeviceId });
  }

  async continuePrepared(record: AccessRegistrationCheckpoint): Promise<void> {
    if (!this.canContinue(record)) return;
    await this.discover({ sourceId: record.request.sourceLogicalDeviceId, requestId: record.request.requestId });
  }

  async selectTarget(target: BleDirectTarget, name: string): Promise<void> {
    if (!this.available() || this.phase !== 'selecting' || !this.targets.includes(target) || !this.selection) return;
    const selection = this.selection;
    await this.run('registering', async signal => selection.requestId
      ? this.port.continueAccessRegistration(selection.requestId, signal, target)
      : this.port.beginAccessRegistration(selection.sourceId, name, signal, target));
  }

  recover(record: AccessRegistrationCheckpoint): Promise<void> {
    if (!this.records.includes(record)) return Promise.resolve();
    return this.run('recovering', signal => this.port.recoverAccessRegistration(record.request.requestId, signal));
  }

  cancelPrepared(record: AccessRegistrationCheckpoint): Promise<void> {
    if (!this.canContinue(record)) return Promise.resolve();
    return this.run('recovering', signal => this.port.cancelAccessRegistration(record.request.requestId, signal));
  }

  async clearResolved(record: AccessRegistrationCheckpoint): Promise<void> {
    if (!this.canClear(record) || !this.available() || this.busy) return;
    const generation = ++this.generation, abort = this.abort = new AbortController();
    this.phase = 'recovering'; this.errorKey = ''; this.changed();
    try {
      await this.port.clearAccessRegistration(record.request.requestId, abort.signal);
      if (!this.current(generation)) return;
      await this.readLocal(generation);
    } catch (error) { if (this.current(generation)) this.errorKey = registrationErrorKey(error); }
    finally { this.finish(generation, abort); }
  }

  sourceBlocked(id: string): boolean {
    return this.records.some(record => record.request.sourceLogicalDeviceId === id
      && (!['closed', 'committed', 'rejected'].includes(record.phase) || record.intent?.device?.state === 'active'));
  }
  canContinue(record: AccessRegistrationCheckpoint): boolean {
    return this.records.includes(record) && record.phase === 'prepared' && record.intent?.state === 'prepared';
  }
  canClear(record: AccessRegistrationCheckpoint): boolean {
    return record.localReferencePending === false && (record.phase === 'rejected' || (record.phase === 'committed'
      ? record.intent?.state === 'committed' : record.phase === 'closed'
        && ['cancelled', 'expired', 'invalidated'].includes(record.intent?.state ?? '')));
  }

  // Leave, background and account replacement cancel work, not the durable
  // server intent. In particular UNKNOWN must never cause another POST.
  retire(clear = false): void {
    this.generation++; this.abort?.abort(); this.abort = undefined;
    this.selectionAbort?.abort(); this.selectionAbort = undefined;
    this.phase = 'idle'; this.targets = []; this.selection = undefined;
    this.presenceSetupPending = false;
    this.noticeKey = ''; this.errorKey = '';
    if (clear) { this.sources = []; this.records = []; }
    this.changed();
  }

  private async discover(selection: { sourceId: string; requestId?: string }): Promise<void> {
    if (!this.available() || this.busy) return;
    this.selectionAbort?.abort();
    const generation = ++this.generation, abort = this.abort = new AbortController();
    this.selectionAbort = abort;
    this.selection = selection; this.phase = 'discovering'; this.targets = [];
    this.errorKey = ''; this.noticeKey = ''; this.changed();
    try {
      const targets = await this.port.discoverAccessRegistrationTargets(abort.signal);
      if (!this.current(generation)) return;
      if (!targets.length) throw Error('BLE_DIRECT_SCAN_TIMEOUT');
      this.targets = targets; this.phase = 'selecting';
    } catch (error) {
      if (this.current(generation)) { this.phase = 'idle'; this.errorKey = registrationErrorKey(error); }
    } finally {
      if (this.abort === abort) this.abort = undefined;
      this.changed();
    }
  }

  private async run(phase: 'registering' | 'recovering', action: (signal: AbortSignal) => Promise<AccessRegistrationOutcome>): Promise<void> {
    if (!this.available() || this.busy) return;
    const generation = ++this.generation, abort = this.abort = new AbortController();
    this.phase = phase; this.targets = []; this.errorKey = ''; this.noticeKey = ''; this.changed();
    this.presenceSetupPending = false;
    try {
      const result = await action(abort.signal);
      if (!this.current(generation)) return;
      await this.readLocal(generation);
      if (!this.current(generation)) return;
      const intent = result.intent;
      if (intent.state === 'committed' && intent.device?.state === 'active') {
        if (result.localReferencePending) this.noticeKey = 'DEVICE_GUIDE.BLE_REGISTRATION_LOCAL_PENDING';
        else {
          this.presenceSetupPending = result.presenceSetupPending === true;
          this.confirmed(intent.targetLogicalDeviceId);
        }
      } else this.noticeKey = intent.state === 'prepared' ? 'DEVICE_GUIDE.BLE_REGISTRATION_PREPARED'
        : 'DEVICE_GUIDE.BLE_REGISTRATION_CLOSED';
    } catch (error) {
      if (!this.current(generation)) return;
      this.errorKey = registrationErrorKey(error);
      await this.readLocal(generation);
    } finally { this.finish(generation, abort); }
  }
  private current(generation: number): boolean { return generation === this.generation && this.available(); }
  private finish(generation: number, abort: AbortController): void {
    if (this.abort === abort) this.abort = undefined;
    if (generation === this.generation) {
      this.phase = 'idle'; this.selectionAbort?.abort(); this.selectionAbort = undefined;
    }
    this.changed();
  }
  private async readLocal(generation: number): Promise<void> {
    const [sources, records] = await Promise.allSettled([
      this.port.accessRegistrationSources(), this.port.accessRegistrationCheckpoints(),
    ]);
    if (!this.current(generation)) return;
    this.sources = sources.status === 'fulfilled' ? sources.value : [];
    if (records.status === 'fulfilled') this.records = records.value;
    else if (!this.errorKey) this.errorKey = 'DEVICE_GUIDE.BLE_RECOVERY_LOAD_FAILED';
    this.changed();
  }
}

function registrationErrorKey(error: unknown): string {
  const value = error as { code?: string; error?: { errorCode?: string }; message?: string } | null;
  const code = value?.code ?? value?.error?.errorCode ?? value?.message ?? '';
  if (code === 'DEVICE_LIMIT_REACHED') return 'DEVICE_GUIDE.BLE_REGISTRATION_LIMIT';
  if (code === 'PRODUCT_ALREADY_REGISTERED') return 'DEVICE_GUIDE.BLE_REGISTRATION_EXISTS';
  if (code === 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING') return 'DEVICE_GUIDE.BLE_REGISTRATION_REJECTED';
  if (/CREDENTIAL_NOT_FOUND|SOURCE_ACTIVE_REQUIRED|LOCAL_ADMIN/.test(code)) return 'DEVICE_GUIDE.BLE_REGISTRATION_ADMIN_REQUIRED';
  if (/CONTEXT_CHANGED|AMBIGUOUS|STALE|SCOPE_CHANGED|TARGET_REQUIRED/.test(code)) return 'DEVICE_GUIDE.BLE_REGISTRATION_CONTEXT_CHANGED';
  if (/CAPABILITY_REQUIRED|DIRECT_REQUIRED/.test(code)) return 'DEVICE_GUIDE.BLE_REGISTRATION_UNSUPPORTED';
  if (/SCAN_TIMEOUT|SCAN_FAILED/.test(code)) return 'DEVICE_GUIDE.BLE_REGISTRATION_NOT_FOUND';
  return 'DEVICE_GUIDE.BLE_REGISTRATION_UNCONFIRMED';
}
