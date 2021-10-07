import { IonicNativePlugin } from '@ionic-native/core';
import { Observable } from 'rxjs';
interface AliyunMessageOrigin {
    /**
     *  message: 透传消息，
     *  notification: 通知接收，
     *  notificationOpened: 通知点击，
     *  notificationReceived: 通知到达，
     *  notificationRemoved: 通知移除，
     *  notificationClickedWithNoAction: 通知到达，
     *  notificationReceivedInApp: 通知到达打开 app
     */
    type: 'message' | 'notification' | 'notificationOpened' | 'notificationReceived' | 'notificationRemoved' | 'notificationClickedWithNoAction' | 'notificationReceivedInApp';
    title: string;
    content: string;
}
export interface AliyunNotification extends AliyunMessageOrigin {
    _ALIYUN_NOTIFICATION_ID_?: string;
}
export interface AliyunMessage extends AliyunMessageOrigin {
    id?: string;
    [prop: string]: any;
}
export declare type Message = AliyunNotification | AliyunMessage;
/**
 * 目标类型
 * 详情参考 阿里云移动推送文档
 */
export declare enum AliyunPushTarget {
    DEVICE_TARGET = 1,
    ACCOUNT_TARGET = 2,
    ALIAS_TARGET = 3
}
export declare class AliyunPush extends IonicNativePlugin {
    getRegisterId(): Promise<string>;
    bindAccount(account: string): Promise<any>;
    unbindAccount(): Promise<any>;
    /**
     * 阿里云推送绑定标签
     * @param tags 标签列表
     */
    bindTags(target: AliyunPushTarget, tags: string[], alias?: string): Promise<any>;
    /**
     * 阿里云推送解除绑定标签
     * @param  {string[]} tags  标签列表
     */
    unbindTags(target: AliyunPushTarget, tags: string[], alias?: string): Promise<any>;
    /**
     * 阿里云推送解除绑定标签
     */
    listTags(): Promise<string[]>;
    /**
     * 没有权限时，请求开通通知权限，其他路过
     * @param  string msg  请求权限的描述信息
     */
    requireNotifyPermission(msg: string): Promise<any>;
    /**
     * 阿里云推送消息透传回调
     */
    onMessage(): Observable<Message>;
    /**
     * 添加别名
     * @param tags 标签列表
     */
    addAlias(alias: string): Promise<any>;
    /**
     * 移除别名
     * @param alias 标签列表
     */
    removeAlias(alias: string): Promise<any>;
    /**
     * 查询已注册别名
     */
    listAliases(): Promise<string[]>;
}
export {};
