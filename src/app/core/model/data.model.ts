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
    email?: string,
    subscriptionPlan?: Record<string, unknown> | null,
    entitlementRevision?: number,
    entitlements?: Record<string, unknown>
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
