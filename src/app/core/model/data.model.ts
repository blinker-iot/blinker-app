import type {
    DeviceV2OwnerShares,
    DeviceV2ReceivedDevice,
    GatewayEntitlements,
    GatewaySubscriptionPlan,
} from './response.model';

export interface AuthData {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    uuid?: string;
    token?: string;
}

export interface UserData {
    username: string,
    nickname?: string | null,
    avatar: string,
    phone: string,
    level?: number,
    email?: string,
    id?: string,
    subscriptionPlan?: GatewaySubscriptionPlan | null,
    permissions?: string[],
    rbacPermissions?: string[],
    entitlementRevision?: number,
    entitlements?: GatewayEntitlements
}

export interface OrderData {
    dict: any;
    list: string[];
}

export interface ShareDate {
    byDevice: Record<string, DeviceV2OwnerShares>;
    received: DeviceV2ReceivedDevice[];
}
