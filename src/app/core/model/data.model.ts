import type {
    GatewayEntitlements,
    GatewaySubscriptionPlan,
} from './gateway.model';

export interface AuthData {
    uuid: string,
    token: string
}

export interface UserData {
    username: string,
    avatar: string,
    phone: string,
    level?: number,
    id?: string,
    nickname?: string | null,
    email?: string,
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
    share: any,
    share0: any,
    shared: any[],
    shared0: any[]
}
