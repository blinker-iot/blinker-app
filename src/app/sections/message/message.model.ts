export interface MessageItem {
    //显示出来的内容
    "title": string,
    "summary"?: string,
    "content": string
    "icon": string,
    "date": number,
    "isRead": string
    //不直接显示的内容
    "type": MessageType,
    "id": string,
    "url": string,
}

export enum MessageType {
    News = 'news',//打开一个url
    System = 'system',//打开一个app页面
    Device = 'device',//打开设备页面
    User = 'user',//打开用户分享页面
}