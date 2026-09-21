import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { parseShareInvitationId } from '../device-v2/sharing/invitation-link';
import {
  DeviceV2OwnerShares,
  DeviceV2PresenceMetadata,
  DeviceV2ReceivedDevice,
  DeviceV2ReceivedSharesResponse,
  DeviceV2ShareGrant,
  DeviceV2ShareInvitation,
  DeviceV2ShareMutation,
  DeviceV2SharePreview,
  DeviceV2ShareRole,
  DeviceV2InvitationInbox,
  DeviceV2PendingInvitation,
} from '../model/response.model';

interface OwnerSharesResponse {
  status: number;
  data: DeviceV2OwnerShares;
}

interface InvitationResponse {
  status: number;
  data: DeviceV2ShareInvitation;
}

interface ShareMutationResponse {
  status: number;
  data: Omit<DeviceV2ShareMutation, 'presenceRotationRequired'> & { presenceRotationRequired?: boolean };
}

export type ShareInvitationReference = string | { invitationId: string };

@Injectable({ providedIn: 'root' })
export class DeviceV2SharingService {
  constructor(private readonly http: HttpClient) {}

  async listDevice(logicalDeviceId: string): Promise<DeviceV2OwnerShares> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(
      this.http.get<OwnerSharesResponse>(API.DEVICE_V2.SHARES(id)),
    );
    return this.ownerShares(this.body(response).data, id);
  }

  async listReceived(): Promise<DeviceV2ReceivedDevice[]> {
    const response = await firstValueFrom(
      this.http.get<DeviceV2ReceivedSharesResponse>(
        API.DEVICE_V2.RECEIVED_SHARES,
      ),
    );
    const devices = this.body(response).data.devices;
    if (!Array.isArray(devices)) throw new Error('共享设备响应无效');
    return devices.map((device) => this.receivedDevice(device));
  }

  async createInvitation(
    logicalDeviceId: string,
    role: DeviceV2ShareRole,
    idempotencyKey: string,
    commandEndpointKeys?: readonly string[],
    recipientAccount?: string,
  ): Promise<DeviceV2ShareInvitation> {
    const id = this.deviceId(logicalDeviceId);
    const access = this.access(role, commandEndpointKeys);
    const email = recipientAccount === undefined ? undefined : this.recipientEmail(recipientAccount);
    const response = await firstValueFrom(this.http.post<InvitationResponse>(
      API.DEVICE_V2.SHARE_INVITATIONS(id),
      email === undefined ? access : { ...access, recipientAccount: email },
      { headers: { 'Idempotency-Key': this.text(idempotencyKey, 128) } },
    ));
    const invitation = this.invitation(this.body(response).data, email === undefined);
    if (email === undefined ? (!invitation.invitationCode || invitation.targeted === true)
      : (invitation.targeted !== true || invitation.invitationCode !== undefined)) throw new Error('共享邀请响应无效');
    return invitation;
  }

  recipientEmail(input: string): string {
    const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
    if (new TextEncoder().encode(email).length > 254
      || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email)) {
      throw new Error('请输入对方注册使用的邮箱');
    }
    return email;
  }

  async revokeInvitation(
    logicalDeviceId: string,
    invitationId: string,
  ): Promise<DeviceV2ShareInvitation> {
    const response = await firstValueFrom(this.http.delete<InvitationResponse>(
      API.DEVICE_V2.SHARE_INVITATION(
        this.deviceId(logicalDeviceId),
        this.text(invitationId, 64),
      ),
    ));
    return this.invitation(this.body(response).data, false);
  }

  async acceptInvitation(reference: ShareInvitationReference): Promise<DeviceV2ShareMutation> {
    const response = await firstValueFrom(this.http.post<ShareMutationResponse>(
      API.DEVICE_V2.ACCEPT_SHARE,
      this.invitationReference(reference),
    ));
    return this.mutation(this.body(response).data);
  }

  async previewInvitation(reference: ShareInvitationReference): Promise<DeviceV2SharePreview> {
    const response = await firstValueFrom(this.http.post<{ status: number; data: DeviceV2SharePreview }>(
      API.DEVICE_V2.PREVIEW_SHARE,
      this.invitationReference(reference),
    ));
    const value = this.body(response).data;
    if (value.state !== 'pending' && value.state !== 'accepted') throw new Error('共享邀请预览无效');
    if (typeof reference !== 'string' && (value.invitationId !== reference.invitationId || value.targeted !== true)) {
      throw new Error('定向邀请响应无效');
    }
    return {
      ...this.invitation(value, false),
      logicalDeviceId: this.deviceId(value.logicalDeviceId),
      deviceName: this.text(value.deviceName, 128),
      deviceType: this.text(value.deviceType, 64),
      currentShare: value.currentShare === null ? null : this.grant(value.currentShare),
    };
  }

  async declineInvitation(invitationId: string): Promise<DeviceV2ShareInvitation> {
    const reference = this.invitationReference({ invitationId });
    const response = await firstValueFrom(this.http.post<InvitationResponse>(API.DEVICE_V2.DECLINE_SHARE, reference));
    const result = this.invitation(this.body(response).data, false);
    if (result.invitationId !== invitationId || !result.targeted || !['declined', 'expired', 'revoked'].includes(result.state)) {
      throw new Error('拒绝邀请响应无效');
    }
    return result;
  }

  async listPendingInvitations(before?: string): Promise<DeviceV2InvitationInbox> {
    const params: Record<string, string> = { limit: '20' };
    if (before !== undefined) params['before'] = this.invitationId(before);
    const response = await firstValueFrom(this.http.get<{ status: number; data: DeviceV2InvitationInbox }>(
      API.DEVICE_V2.INVITATION_INBOX, { params }));
    const value = this.body(response).data;
    if (!Array.isArray(value.items) || value.items.length > 20) throw new Error('邀请列表响应无效');
    const items: DeviceV2PendingInvitation[] = value.items.map(item => {
      if (item.state !== 'pending' || item.targeted !== true || item.invitationCode !== undefined) throw new Error('定向邀请响应无效');
      return { ...this.invitation(item, false), state: 'pending', targeted: true,
        invitationId: this.invitationId(item.invitationId), logicalDeviceId: this.deviceId(item.logicalDeviceId),
        deviceName: this.text(item.deviceName, 128), deviceType: this.text(item.deviceType, 64) };
    });
    const nextCursor = value.nextCursor === null ? null : this.invitationId(value.nextCursor);
    if (new Set(items.map(item => item.invitationId)).size !== items.length
      || (nextCursor !== null && (nextCursor === before || nextCursor !== items.at(-1)?.invitationId))) {
      throw new Error('邀请分页响应无效');
    }
    return { items, nextCursor };
  }

  private invitationId(value: string): string {
    const id = parseShareInvitationId(value);
    if (!id) throw new Error('邀请标识无效');
    return id;
  }

  private invitationReference(reference: ShareInvitationReference): { invitationCode: string } | { invitationId: string } {
    return typeof reference === 'string' ? { invitationCode: this.invitationCode(reference) }
      : { invitationId: this.invitationId(reference?.invitationId) };
  }

  async updateShare(
    logicalDeviceId: string,
    shareId: string,
    role: DeviceV2ShareRole,
    commandEndpointKeys?: readonly string[],
  ): Promise<DeviceV2ShareMutation> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.patch<ShareMutationResponse>(
      API.DEVICE_V2.SHARE(id, this.text(shareId, 64)),
      this.access(role, commandEndpointKeys),
    ));
    return this.mutation(this.body(response).data, id);
  }

  async revokeShare(
    logicalDeviceId: string,
    shareId: string,
  ): Promise<DeviceV2ShareMutation> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.delete<ShareMutationResponse>(
      API.DEVICE_V2.SHARE(id, this.text(shareId, 64)),
    ));
    return this.mutation(this.body(response).data, id);
  }

  async leaveShare(logicalDeviceId: string): Promise<DeviceV2ShareMutation> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.delete<ShareMutationResponse>(
      API.DEVICE_V2.RECEIVED_SHARE(id),
    ));
    return this.mutation(this.body(response).data, id);
  }

  private mutation(value: ShareMutationResponse['data'], expectedId?: string): DeviceV2ShareMutation {
    if (!value || typeof value.replayed !== 'boolean'
      || typeof value.realtimeRefreshPending !== 'boolean'
      || (value.presenceRotationRequired !== undefined && typeof value.presenceRotationRequired !== 'boolean')
      || (expectedId !== undefined && value.logicalDeviceId !== expectedId)) {
      throw new Error('共享权限同步响应无效');
    }
    return {
      logicalDeviceId: this.deviceId(value.logicalDeviceId),
      share: this.grant(value.share),
      replayed: value.replayed,
      realtimeRefreshPending: value.realtimeRefreshPending,
      presenceRotationRequired: value.presenceRotationRequired === true,
    };
  }

  private ownerShares(value: DeviceV2OwnerShares, id: string): DeviceV2OwnerShares {
    if (!value || value.logicalDeviceId !== id
      || !Array.isArray(value.shares) || !Array.isArray(value.invitations)) {
      throw new Error('设备共享响应无效');
    }
    return {
      logicalDeviceId: id,
      shares: value.shares.map((share) => this.grant(share)),
      invitations: value.invitations.map((item) => this.invitation(item, false)),
    };
  }

  private receivedDevice(value: DeviceV2ReceivedDevice): DeviceV2ReceivedDevice {
    if (!value || !value.tenantId || !value.name || !value.deviceType
      || typeof value.cloudEnabled !== 'boolean') {
      throw new Error('共享设备响应无效');
    }
    return {
      logicalDeviceId: this.deviceId(value.logicalDeviceId),
      tenantId: this.text(value.tenantId, 128),
      name: this.text(value.name, 128),
      deviceType: this.text(value.deviceType, 64),
      cloudEnabled: value.cloudEnabled,
      share: this.grant(value.share),
      ...this.presence(value),
    };
  }

  private presence(value: DeviceV2PresenceMetadata): DeviceV2PresenceMetadata {
    const integerOrNull = (input: unknown) => input === null
      || typeof input === 'number' && Number.isSafeInteger(input) && input >= 0;
    const fingerprintOrNull = value.manifestFingerprint === null
      || typeof value.manifestFingerprint === 'string'
        && /^[0-9a-f]{64}$/.test(value.manifestFingerprint);
    if ((value.cloudReachable !== null && typeof value.cloudReachable !== 'boolean')
      || !integerOrNull(value.cloudLastSeenAt)
      || !integerOrNull(value.manifestRevision)
      || !fingerprintOrNull
      || !integerOrNull(value.manifestUpdatedAt)) {
      throw new Error('共享设备在线状态响应无效');
    }
    return {
      cloudReachable: value.cloudReachable,
      cloudLastSeenAt: value.cloudLastSeenAt,
      manifestRevision: value.manifestRevision,
      manifestFingerprint: value.manifestFingerprint,
      manifestUpdatedAt: value.manifestUpdatedAt,
    };
  }

  private grant(value: DeviceV2ShareGrant): DeviceV2ShareGrant {
    if (!value || !Number.isSafeInteger(value.version) || value.version < 1
      || !Number.isSafeInteger(value.createdAt)
      || !Number.isSafeInteger(value.updatedAt)
      || (value.state !== 'active' && value.state !== 'revoked')) {
      throw new Error('共享权限响应无效');
    }
    const role = this.role(value.role);
    const keys = role === 'operator'
      ? this.endpointKeys(value.commandEndpointKeys)
      : null;
    return {
      ...value,
      shareId: this.text(value.shareId, 64),
      role,
      commandEndpointKeys: keys,
      memberRef: value.memberRef
        ? this.text(value.memberRef, 64)
        : undefined,
    };
  }

  private invitation(
    value: DeviceV2ShareInvitation,
    requireCode: boolean,
  ): DeviceV2ShareInvitation {
    if (!value || !Number.isSafeInteger(value.expiresAt)
      || !['pending', 'accepted', 'revoked', 'expired', 'declined'].includes(value.state)
      || (value.targeted !== undefined && typeof value.targeted !== 'boolean')) {
      throw new Error('共享邀请响应无效');
    }
    const role = this.role(value.role);
    const code = value.invitationCode;
    if (requireCode && !code) throw new Error('共享邀请码响应无效');
    return {
      ...value,
      invitationId: this.text(value.invitationId, 64),
      invitationCode: code ? this.invitationCode(code) : undefined,
      role,
      commandEndpointKeys: role === 'operator'
        ? this.endpointKeys(value.commandEndpointKeys)
        : null,
    };
  }

  private access(
    role: DeviceV2ShareRole,
    commandEndpointKeys?: readonly string[],
  ): { role: DeviceV2ShareRole; commandEndpointKeys?: string[] } {
    const normalizedRole = this.role(role);
    if (normalizedRole === 'viewer') return { role: normalizedRole };
    const keys = this.endpointKeys(commandEndpointKeys ?? null);
    return keys === null
      ? { role: normalizedRole }
      : { role: normalizedRole, commandEndpointKeys: keys };
  }

  private endpointKeys(value: readonly string[] | null): string[] | null {
    if (value === null) return null;
    if (!Array.isArray(value) || value.length > 64) {
      throw new Error('共享端点范围无效');
    }
    const keys = value.map((key) => this.text(key, 64)).sort();
    if (new Set(keys).size !== keys.length) throw new Error('共享端点范围无效');
    return keys;
  }

  private role(value: string): DeviceV2ShareRole {
    if (value !== 'viewer' && value !== 'operator') {
      throw new Error('共享角色无效');
    }
    return value;
  }

  private invitationCode(value: string): string {
    const code = value.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('共享邀请码无效');
    return code;
  }

  private deviceId(value: string): string {
    const id = this.text(value, 128);
    if (id.includes('/')) throw new Error('Device V2 标识无效');
    return id;
  }

  private text(value: string, maximum: number): string {
    if (typeof value !== 'string' || !value || value !== value.trim()
      || value.includes('\0') || new TextEncoder().encode(value).length > maximum) {
      throw new Error('共享参数无效');
    }
    return value;
  }

  private body<T extends { status: number; data: unknown }>(value: T): T {
    if (!value?.data || !Number.isSafeInteger(value.status)
      || value.status < 200 || value.status >= 300) {
      throw new Error('共享服务响应无效');
    }
    return value;
  }
}
