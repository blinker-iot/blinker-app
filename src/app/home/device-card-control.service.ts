import { DestroyRef, Injectable, effect, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge, Subscription } from 'rxjs';
import { API } from '../configs/api.config';
import { captureDeviceV2AccountContext, DeviceV2AccountContext } from '../core/device-v2/account-scope';
import { canWriteDeviceEndpoint, validateDeviceUiControlValue } from '../core/device-v2/endpoint-control';
import { DeviceUiConnection, DeviceUiEndpoint, DeviceUiPort, DeviceUiSnapshot } from '../core/device-v2/device-ui.port';
import { Bbp2ErrorCode, DeviceV2RouteError } from '../core/protocol/device-v2';
import { DirectDeviceProtocolError } from '../core/protocol/device-v2/direct-session';
import { DataService } from '../core/services/data.service';
import { homeCardBindingField } from './components/deviceblock/device-card-presentation';
import { DeviceCardEditor } from './device-card-editor.service';
import { HomeCardBinding } from './device-card-preferences';
import { HomeCardControlIntent, HomeCardControlStatus } from './device-card-control.models';

interface ControlOwner {
  id: string;
  account: DeviceV2AccountContext;
  controller: AbortController;
  scope?: DeviceUiConnection;
  subscriptions: Subscription;
  snapshot?: DeviceUiSnapshot;
  connectionState: string;
  busy: boolean;
  binding: HomeCardBinding;
  dispatched: boolean;
  acknowledged: boolean;
  fingerprint?: string | null;
  revision?: number | null;
  value?: unknown;
  stateConfirmed: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const IDLE: HomeCardControlStatus = { phase: 'idle', message: '', busy: false, blocked: false };

// A page/gesture owner, not a second command engine. Wire correlation, validation,
// transport selection and in-flight exclusion remain in the existing Port/Session.
@Injectable()
export class DeviceCardControl {
  private readonly records = signal<ReadonlyMap<string, Readonly<Record<string, HomeCardControlStatus>>>>(new Map());
  private owner?: ControlOwner;
  private visible = false;
  private accountKey = '';

  constructor(private readonly data: DataService, private readonly ui: DeviceUiPort,
    private readonly editor: DeviceCardEditor, destroyRef: DestroyRef) {
    effect(() => {
      const enabled = this.editor.active() && !this.editor.editing() && !this.editor.settingsId();
      this.editor.generation();
      untracked(() => { if (!enabled) this.retire(); else this.reconcile(); });
    });
    merge(data.authDataChanged, data.deviceDataLoader, data.userDataLoader)
      .pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.reconcile());
    destroyRef.onDestroy(() => this.retire());
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.retire();
    else this.reconcile();
  }

  stop(): void { this.retire(); }

  states(id: string): Readonly<Record<string, HomeCardControlStatus>> {
    return this.records().get(id) ?? {};
  }

  private enabled(): boolean {
    return this.visible && this.editor.active() && !this.editor.editing() && !this.editor.settingsId() && !!this.data.auth?.uuid;
  }

  private context(): DeviceV2AccountContext | undefined {
    if (!this.data.auth?.uuid) return undefined;
    try { return captureDeviceV2AccountContext(this.data, API.BASE_URL); } catch { return undefined; }
  }

  private sameAccount(account: DeviceV2AccountContext): boolean {
    const current = this.context();
    return !!current && current.authority === account.authority && current.accountId === account.accountId
      && current.sessionEpoch === account.sessionEpoch;
  }

  private visibleDevice(id: string): boolean {
    const device = this.data.device?.dict?.[id];
    return !!device && this.data.device.list.includes(id) && device.config.mode === 'bbp2'
      && !device.config.disabled && !device.config.isPreview;
  }

  private configured(id: string, binding: HomeCardBinding): boolean {
    return this.editor.bindings(id)?.some(current => current.key === binding.key && current.kind === binding.kind
      && current.type === binding.type && (current.mode ?? 'read') === (binding.mode ?? 'read')) === true;
  }

  private current(owner: ControlOwner): boolean {
    return this.owner === owner && this.enabled() && this.sameAccount(owner.account) && this.visibleDevice(owner.id)
      && this.configured(owner.id, owner.binding) && !owner.controller.signal.aborted;
  }

  private reconcile(): void {
    const account = this.context();
    const key = account ? JSON.stringify([account.authority, account.accountId, account.sessionEpoch]) : '';
    if (key !== this.accountKey) {
      this.retire(); this.records.set(new Map()); this.accountKey = key;
    }
    const owner = this.owner;
    if (owner && (!this.current(owner) || !this.allowed(owner))) this.retire();
  }

  private allowed(owner: ControlOwner): DeviceUiEndpoint | undefined {
    const field = homeCardBindingField(owner.snapshot, owner.binding);
    return field && canWriteDeviceEndpoint(this.data.device?.dict?.[owner.id], field) ? field : undefined;
  }

  private set(id: string, key: string, phase: HomeCardControlStatus['phase'], message: string,
    busy = false, blocked = false): boolean {
    const records = new Map(this.records());
    // Bound presentation state without evicting an unresolved outcome. No payloads or credentials.
    if (!records.has(id) && records.size >= 64) {
      const discard = [...records].find(([, fields]) => !Object.values(fields).some(status => status.blocked || status.busy));
      if (!discard) return false;
      records.delete(discard[0]);
    }
    const fields = { ...records.get(id), [key]: { phase, message, busy, blocked } };
    const keys = Object.keys(fields);
    if (keys.length > 8) {
      const discard = keys.find(candidate => candidate !== key && !fields[candidate].busy && !fields[candidate].blocked);
      if (!discard) return false;
      delete fields[discard];
    }
    records.set(id, fields); this.records.set(records); return true;
  }

  private arm(owner: ControlOwner, ms: number, expire: () => void): void {
    clearTimeout(owner.timer);
    owner.timer = setTimeout(() => { if (this.owner === owner) expire(); }, ms);
  }

  private release(owner: ControlOwner): void {
    if (this.owner !== owner) return;
    this.owner = undefined;
    clearTimeout(owner.timer);
    owner.controller.abort(); owner.scope?.close(); owner.subscriptions.unsubscribe();
  }

  private retire(): void {
    const owner = this.owner;
    if (!owner) return;
    if (owner.dispatched && (!owner.acknowledged || !owner.stateConfirmed)) {
      this.set(owner.id, owner.binding.key, owner.acknowledged ? 'accepted' : 'unknown',
        owner.acknowledged ? '已接受，状态未确认；请在设备页核对' : '结果未确认；请在设备页核对，勿重复操作', false, true);
    } else this.set(owner.id, owner.binding.key, 'idle', '');
    this.release(owner);
  }

  private observe(id: string, binding: HomeCardBinding, account: DeviceV2AccountContext): ControlOwner {
    const owner: ControlOwner = { id, binding, account, controller: new AbortController(), subscriptions: new Subscription(),
      connectionState: 'idle', busy: false, dispatched: false, acknowledged: false, stateConfirmed: false };
    this.owner = owner;
    owner.subscriptions.add(this.ui.watchState(id).subscribe(snapshot => {
      if (!this.current(owner)) return;
      owner.snapshot = snapshot;
      if (!owner.dispatched) return;
      if (snapshot.manifestFingerprint !== owner.fingerprint || !snapshot.manifestAccepted) { this.retire(); return; }
      const field = this.allowed(owner);
      if (!field) { this.retire(); return; }
      const newRevision = snapshot.stateRevision !== null && owner.revision !== null
        && owner.revision !== undefined && snapshot.stateRevision > owner.revision;
      owner.stateConfirmed = snapshot.stateFresh && newRevision && matchesValue(field, owner.value);
      if (owner.stateConfirmed && owner.acknowledged) {
        this.set(id, binding.key, 'synced', '状态已同步'); this.release(owner);
      }
    }));
    owner.subscriptions.add(this.ui.watchConnection(id).subscribe(state => {
      if (this.owner !== owner) return;
      owner.connectionState = state;
      if (owner.dispatched && state !== 'ready') this.retire();
    }));
    return owner;
  }

  async control(id: string, intent: HomeCardControlIntent): Promise<void> {
    this.reconcile();
    const binding = intent.binding, mode = binding.mode ?? 'read';
    if (!this.enabled() || mode === 'read' || !this.visibleDevice(id) || !this.configured(id, binding)) return;
    const status = this.states(id)[binding.key] ?? IDLE;
    if (status.blocked || status.busy || this.owner?.busy) return; // No queue or replay.
    if (this.owner && (this.owner.id !== id || this.owner.binding.key !== binding.key)) this.retire();
    const account = this.context();
    if (!account) return;
    const owner = this.owner ?? this.observe(id, binding, account);
    if (!this.current(owner)) return;
    if (!this.allowed(owner)) {
      this.set(id, binding.key, 'rejected', '功能不可用或没有控制权限'); this.release(owner); return;
    }
    owner.busy = true;
    if (!this.set(id, binding.key, 'connecting', '连接并同步中', true)) { this.release(owner); return; }
    this.arm(owner, 30_000, () => this.retire());
    try {
      if (!owner.scope) {
        owner.scope = this.ui.openConnection(id, owner.controller.signal);
        void owner.scope.closed.then(() => { if (this.owner === owner) this.retire(); });
      }
      await owner.scope.ready;
      if (!this.current(owner) || owner.scope.signal.aborted) return;
      const snapshot = owner.snapshot, field = this.allowed(owner);
      if (!field || owner.connectionState !== 'ready' || !snapshot?.stateFresh
        || !Number.isSafeInteger(snapshot.stateRevision) || snapshot.stateRevision! < 0) {
        this.set(id, binding.key, 'rejected', '状态尚未就绪，请稍后重新连接'); this.release(owner); return;
      }
      const witnessed = intent.stateFresh && intent.manifestFingerprint === snapshot.manifestFingerprint
        && intent.stateRevision === snapshot.stateRevision;
      if (!witnessed || mode === 'range' && intent.value === undefined) {
        owner.busy = false;
        this.set(id, binding.key, 'ready', '已就绪，请再次明确操作');
        this.arm(owner, 15_000, () => { this.set(id, binding.key, 'idle', '连接以操作'); this.release(owner); });
        return;
      }
      const value = mode === 'toggle' ? typeof field.value === 'boolean' ? !field.value : undefined
        : mode === 'action' ? field.manifestType === 9 ? null : true : intent.value;
      validateDeviceUiControlValue(field, value);
      // No await between the final context/ACL/witness checks and dispatch.
      if (!this.current(owner) || !this.allowed(owner)) return;
      owner.fingerprint = snapshot.manifestFingerprint; owner.revision = snapshot.stateRevision; owner.value = value;
      owner.dispatched = true;
      this.set(id, binding.key, 'pending', '等待设备确认', true);
      this.arm(owner, 30_000, () => this.retire());
      await this.ui.sendCommand(id, binding.key, value);
      if (!this.current(owner)) return;
      owner.acknowledged = true;
      if (mode === 'action' || owner.stateConfirmed) {
        this.set(id, binding.key, mode === 'action' ? 'accepted' : 'synced', mode === 'action' ? '设备已接受' : '状态已同步');
        this.release(owner);
      } else {
        this.set(id, binding.key, 'accepted', '已接受，等待新鲜状态', true);
        this.arm(owner, 5_000, () => this.retire());
      }
    } catch (error) {
      if (!this.current(owner)) return;
      const rejected = !owner.dispatched || definiteRejection(error);
      this.set(id, binding.key, rejected ? 'rejected' : 'unknown', rejected
        ? '本次未确认接受，请核对权限、范围或设备状态后再操作'
        : '结果未确认；请在设备页核对，勿重复操作', false, !rejected);
      this.release(owner);
    } finally {
      this.reconcile();
      if (this.owner === owner && owner.scope?.signal.aborted) this.retire();
    }
  }
}

function definiteRejection(error: unknown): boolean {
  return ((error instanceof DeviceV2RouteError || error instanceof DirectDeviceProtocolError)
    && Object.values(Bbp2ErrorCode).includes(error.code) && error.code !== Bbp2ErrorCode.Internal)
    || error instanceof Error && ['DEVICE_UI_COMMAND_PENDING', 'DEVICE_UI_COMMAND_CAPACITY'].includes(error.message);
}

function matchesValue(field: DeviceUiEndpoint, expected: unknown): boolean {
  if (typeof field.value === 'bigint' && typeof expected === 'number' && Number.isSafeInteger(expected)) return field.value === BigInt(expected);
  if (field.manifestType === 3 && typeof expected === 'number') return field.value === Math.fround(expected);
  return field.value === expected;
}
