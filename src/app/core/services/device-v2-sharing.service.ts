import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import {
  DeviceV2OwnerShares,
  DeviceV2PresenceMetadata,
  DeviceV2ReceivedDevice,
  DeviceV2ReceivedSharesResponse,
  DeviceV2ShareGrant,
  DeviceV2ShareInvitation,
  DeviceV2ShareRole,
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
  data: {
    logicalDeviceId: string;
    share: DeviceV2ShareGrant;
    replayed: boolean;
    realtimeRefreshPending: boolean;
  };
}

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
  ): Promise<DeviceV2ShareInvitation> {
    const id = this.deviceId(logicalDeviceId);
    const access = this.access(role, commandEndpointKeys);
    const response = await firstValueFrom(this.http.post<InvitationResponse>(
      API.DEVICE_V2.SHARE_INVITATIONS(id),
      access,
      { headers: { 'Idempotency-Key': this.text(idempotencyKey, 128) } },
    ));
    const invitation = this.invitation(this.body(response).data, true);
    if (!invitation.invitationCode) throw new Error('共享邀请码响应无效');
    return invitation;
  }

  async revokeInvitation(
    logicalDeviceId: string,
    invitationId: string,
  ): Promise<void> {
    await firstValueFrom(this.http.delete(
      API.DEVICE_V2.SHARE_INVITATION(
        this.deviceId(logicalDeviceId),
        this.text(invitationId, 64),
      ),
    ));
  }

  async acceptInvitation(invitationCode: string): Promise<DeviceV2ShareGrant> {
    const response = await firstValueFrom(this.http.post<ShareMutationResponse>(
      API.DEVICE_V2.ACCEPT_SHARE,
      { invitationCode: this.invitationCode(invitationCode) },
    ));
    return this.grant(this.body(response).data.share);
  }

  async updateShare(
    logicalDeviceId: string,
    shareId: string,
    role: DeviceV2ShareRole,
    commandEndpointKeys?: readonly string[],
  ): Promise<DeviceV2ShareGrant> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.patch<ShareMutationResponse>(
      API.DEVICE_V2.SHARE(id, this.text(shareId, 64)),
      this.access(role, commandEndpointKeys),
    ));
    return this.grant(this.body(response).data.share);
  }

  async revokeShare(
    logicalDeviceId: string,
    shareId: string,
  ): Promise<DeviceV2ShareGrant> {
    const id = this.deviceId(logicalDeviceId);
    const response = await firstValueFrom(this.http.delete<ShareMutationResponse>(
      API.DEVICE_V2.SHARE(id, this.text(shareId, 64)),
    ));
    return this.grant(this.body(response).data.share);
  }

  async leaveShare(logicalDeviceId: string): Promise<void> {
    await firstValueFrom(this.http.delete(
      API.DEVICE_V2.RECEIVED_SHARE(this.deviceId(logicalDeviceId)),
    ));
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
    if (!value || !value.tenantId || !value.name || !value.deviceType) {
      throw new Error('共享设备响应无效');
    }
    return {
      logicalDeviceId: this.deviceId(value.logicalDeviceId),
      tenantId: this.text(value.tenantId, 128),
      name: this.text(value.name, 128),
      deviceType: this.text(value.deviceType, 64),
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
      || !['pending', 'accepted', 'revoked', 'expired'].includes(value.state)) {
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
