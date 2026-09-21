import { Injectable, signal } from '@angular/core';
import { DeviceV2ShareMutation, DeviceV2SharePreview } from '../model/response.model';
import { parseShareInvitation, parseShareInvitationId } from '../device-v2/sharing/invitation-link';
import { DataService } from './data.service';
import { DeviceV2SharingService, ShareInvitationReference } from './device-v2-sharing.service';

type Phase = 'empty' | 'login' | 'loading' | 'preview' | 'accepting' | 'accepted' | 'declining' | 'declined' | 'error';
interface InvitationState {
  phase: Phase;
  preview?: DeviceV2SharePreview;
  result?: DeviceV2ShareMutation;
  message?: string;
}

// One memory-only invitation flow shared by paste, native links and future
// notification input. Transport and account authority remain separate services.
@Injectable({ providedIn: 'root' })
export class DeviceV2ShareInvitationService {
  readonly state = signal<InvitationState>({ phase: 'empty' });
  private reference: ShareInvitationReference | null = null;
  private generation = 0;
  private account: string | undefined;
  private previewEpoch = -1;

  constructor(private readonly data: DataService, private readonly sharing: DeviceV2SharingService) {
    this.account = data.auth?.uuid;
    data.authDataChanged.subscribe(() => {
      const next = data.auth?.uuid;
      // Preserve an anonymous invitation across initial login only. Account
      // switching/logout cannot carry an old member's confirmation forward.
      if (this.account && this.account !== next) this.clear();
      else {
        this.generation++;
        this.previewEpoch = -1;
        this.state.set({ phase: this.reference && !next ? 'login' : 'empty' });
      }
      this.account = next;
    });
  }

  get hasPending(): boolean { return this.reference !== null; }

  stage(input: unknown): boolean {
    const code = parseShareInvitation(input);
    if (!code) return false;
    return this.stageReference(code);
  }

  stageDirected(input: unknown): boolean {
    const invitationId = parseShareInvitationId(input);
    return invitationId ? this.stageReference({ invitationId }) : false;
  }

  private stageReference(reference: ShareInvitationReference): boolean {
    if (JSON.stringify(this.reference) === JSON.stringify(reference) && this.busy) return true;
    this.generation++;
    this.reference = reference;
    this.previewEpoch = -1;
    this.state.set({ phase: this.data.auth?.uuid ? 'empty' : 'login' });
    void this.refresh();
    return true;
  }

  private get busy(): boolean { return ['loading', 'accepting', 'declining'].includes(this.state().phase); }

  clear(): void {
    this.generation++;
    this.reference = null;
    this.previewEpoch = -1;
    this.state.set({ phase: 'empty' });
  }

  async refresh(): Promise<void> {
    if (!this.reference || this.busy) return;
    if (!this.data.auth?.uuid) { this.state.set({ phase: 'login' }); return; }
    const reference = this.reference, epoch = this.data.sessionEpoch, generation = ++this.generation;
    this.state.set({ phase: 'loading' });
    try {
      const preview = await this.sharing.previewInvitation(reference);
      if (!this.current(generation, epoch)) return;
      this.previewEpoch = epoch;
      this.state.set({ phase: 'preview', preview });
    } catch (error) {
      if (this.current(generation, epoch)) this.state.set({ phase: 'error', message: invitationError(error) });
    }
  }

  async accept(): Promise<void> {
    const view = this.state();
    if (view.phase !== 'preview' || !view.preview || !this.reference) return;
    if (this.previewEpoch !== this.data.sessionEpoch || !this.data.auth?.uuid) { await this.refresh(); return; }
    if (view.preview.state === 'accepted' && view.preview.currentShare?.state !== 'active') return;
    const reference = this.reference, epoch = this.data.sessionEpoch, generation = ++this.generation;
    this.state.set({ ...view, phase: 'accepting' });
    try {
      const result = await this.sharing.acceptInvitation(reference);
      if (!this.current(generation, epoch)) return;
      if (result.logicalDeviceId !== view.preview.logicalDeviceId) throw new Error('INVITATION_DEVICE_MISMATCH');
      this.reference = null; // No accepted bearer proof retained for later sessions.
      this.state.set({ phase: 'accepted', result, preview: view.preview });
    } catch (error) {
      if (this.current(generation, epoch)) this.state.set({ phase: 'error', message: invitationError(error) });
    }
  }

  async decline(): Promise<void> {
    const view = this.state();
    if (view.phase !== 'preview' || view.preview?.state !== 'pending' || !view.preview.targeted || !this.reference) return;
    if (this.previewEpoch !== this.data.sessionEpoch || !this.data.auth?.uuid) { await this.refresh(); return; }
    const epoch = this.data.sessionEpoch, generation = ++this.generation;
    this.state.set({ ...view, phase: 'declining' });
    try {
      const result = await this.sharing.declineInvitation(view.preview.invitationId);
      if (!this.current(generation, epoch)) return;
      this.reference = null;
      this.state.set({ phase: 'declined', message: result.state === 'declined' ? '已拒绝此次邀请，已有设备分享不受影响' : '该邀请已失效' });
    } catch (error) {
      if (this.current(generation, epoch)) this.state.set({ phase: 'error', message: invitationError(error) });
    }
  }

  private current(generation: number, epoch: number): boolean {
    return generation === this.generation && epoch === this.data.sessionEpoch && !!this.data.auth?.uuid;
  }
}

function invitationError(error: unknown): string {
  const item = error as { code?: string; error?: { errorCode?: string }; status?: number };
  const code = item?.code || item?.error?.errorCode;
  switch (code) {
    case 'DEVICE_V2_SHARE_INVITATION_EXPIRED': return '邀请已过期或已取消，请让所有者重新邀请';
    case 'DEVICE_V2_SHARE_INVITATION_CONSUMED': return '邀请已被其他账号领取';
    case 'DEVICE_V2_SHARE_OWNER_CANNOT_ACCEPT': return '这是你自己的设备，无需领取分享';
    case 'DEVICE_V2_SHARE_INVITATION_NOT_FOUND': return '未找到有效邀请，请检查链接';
    case 'DEVICE_V2_ROUTE_NOT_READY':
    case 'BROKER_ALLOCATION_PENDING': return '通信服务准备中，请稍后重试';
    case 'DEVICE_V2_CROSS_SHARD_SHARE_UNSUPPORTED': return '当前服务尚未开放此账号间的分享，请稍后重试';
    case 'DEVICE_V2_DEVICE_NOT_FOUND': return '该设备或所有者当前不可用';
    default: return '暂时无法获取邀请，请检查登录或网络后重试';
  }
}
