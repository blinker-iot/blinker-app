export interface AuthData {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    uuid?: string;
    token?: string;
}

export interface UserData {
    username: string,
    avatar: string,
    phone: string,
    level?: number,
    email?: string,
    id?: string,
    subscriptionPlan?: string,
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
