var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
import { IonicNativePlugin, cordova, ngModule } from '@ionic-native/core';
import { Observable } from 'rxjs';
/**
 * 目标类型
 * 详情参考 阿里云移动推送文档
 */
export var AliyunPushTarget;
(function (AliyunPushTarget) {
    AliyunPushTarget[AliyunPushTarget["DEVICE_TARGET"] = 1] = "DEVICE_TARGET";
    AliyunPushTarget[AliyunPushTarget["ACCOUNT_TARGET"] = 2] = "ACCOUNT_TARGET";
    AliyunPushTarget[AliyunPushTarget["ALIAS_TARGET"] = 3] = "ALIAS_TARGET"; // 别名
})(AliyunPushTarget || (AliyunPushTarget = {}));
var AliyunPushOriginal = /** @class */ (function (_super) {
    __extends(AliyunPushOriginal, _super);
    function AliyunPushOriginal() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    AliyunPushOriginal.prototype.getRegisterId = function () { return cordova(this, "getRegisterId", {}, arguments); };
    AliyunPushOriginal.prototype.bindAccount = function (account) { return cordova(this, "bindAccount", {}, arguments); };
    AliyunPushOriginal.prototype.unbindAccount = function () { return cordova(this, "unbindAccount", {}, arguments); };
    AliyunPushOriginal.prototype.bindTags = function (target, tags, alias) { return cordova(this, "bindTags", {}, arguments); };
    AliyunPushOriginal.prototype.unbindTags = function (target, tags, alias) { return cordova(this, "unbindTags", {}, arguments); };
    AliyunPushOriginal.prototype.listTags = function () { return cordova(this, "listTags", {}, arguments); };
    AliyunPushOriginal.prototype.requireNotifyPermission = function (msg) { return cordova(this, "requireNotifyPermission", {}, arguments); };
    AliyunPushOriginal.prototype.onMessage = function () { return cordova(this, "onMessage", { "observable": true }, arguments); };
    AliyunPushOriginal.prototype.addAlias = function (alias) { return cordova(this, "addAlias", {}, arguments); };
    AliyunPushOriginal.prototype.removeAlias = function (alias) { return cordova(this, "removeAlias", {}, arguments); };
    AliyunPushOriginal.prototype.listAliases = function () { return cordova(this, "listAliases", {}, arguments); };
    AliyunPushOriginal.pluginName = "AliyunPush";
    AliyunPushOriginal.plugin = "cordova-plugin-aliyunpush";
    AliyunPushOriginal.pluginRef = "AliyunPush";
    AliyunPushOriginal.repo = "https://github.com/log2c/cordova-plugin-aliyunpush.git";
    AliyunPushOriginal.platforms = ["Android", "iOS"];
    AliyunPushOriginal.install = "";
    AliyunPushOriginal.installVariables = ["ANDROID_APP_KEY", "ANDROID_APP_SECRET", "IOS_APP_KEY", "IOS_APP_SECRET", "HUAWEI_APPID", "MIPUSH_APPID", "MIPUSH_APPKEY"];
    return AliyunPushOriginal;
}(IonicNativePlugin));
var AliyunPush = new AliyunPushOriginal();
export { AliyunPush };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQGlvbmljLW5hdGl2ZS9wbHVnaW5zL2FsaXl1bi1wdXNoL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBQSxPQUFPLHdDQUFzQyxNQUFNLG9CQUFvQixDQUFDO0FBRXhFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxNQUFNLENBQUM7QUE0QmxDOzs7R0FHRztBQUNILE1BQU0sQ0FBTixJQUFZLGdCQUlYO0FBSkQsV0FBWSxnQkFBZ0I7SUFDMUIseUVBQWlCLENBQUE7SUFDakIsMkVBQWtCLENBQUE7SUFDbEIsdUVBQWdCLENBQUEsQ0FBSSxLQUFLO0FBQzNCLENBQUMsRUFKVyxnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBSTNCOztJQWdEK0IsOEJBQWlCOzs7O0lBRy9DLGtDQUFhO0lBS2IsZ0NBQVcsYUFBQyxPQUFlO0lBSzNCLGtDQUFhO0lBU2IsNkJBQVEsYUFBQyxNQUF3QixFQUFFLElBQWMsRUFBRSxLQUFjO0lBU2pFLCtCQUFVLGFBQUMsTUFBd0IsRUFBRSxJQUFjLEVBQUUsS0FBYztJQVFuRSw2QkFBUTtJQVNSLDRDQUF1QixhQUFDLEdBQVc7SUFVbkMsOEJBQVM7SUFTVCw2QkFBUSxhQUFDLEtBQWE7SUFTdEIsZ0NBQVcsYUFBQyxLQUFhO0lBUXpCLGdDQUFXOzs7Ozs7OztxQkExS2I7RUFzRmdDLGlCQUFpQjtTQUFwQyxVQUFVIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGx1Z2luLCBDb3Jkb3ZhLCBJb25pY05hdGl2ZVBsdWdpbiB9IGZyb20gJ0Bpb25pYy1uYXRpdmUvY29yZSc7XG5pbXBvcnQgeyBJbmplY3RhYmxlIH0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAncnhqcyc7XG5cblxuaW50ZXJmYWNlIEFsaXl1bk1lc3NhZ2VPcmlnaW4ge1xuICAvKipcbiAgICogIG1lc3NhZ2U6IOmAj+S8oOa2iOaBr++8jFxuICAgKiAgbm90aWZpY2F0aW9uOiDpgJrnn6XmjqXmlLbvvIxcbiAgICogIG5vdGlmaWNhdGlvbk9wZW5lZDog6YCa55+l54K55Ye777yMXG4gICAqICBub3RpZmljYXRpb25SZWNlaXZlZDog6YCa55+l5Yiw6L6+77yMXG4gICAqICBub3RpZmljYXRpb25SZW1vdmVkOiDpgJrnn6Xnp7vpmaTvvIxcbiAgICogIG5vdGlmaWNhdGlvbkNsaWNrZWRXaXRoTm9BY3Rpb246IOmAmuefpeWIsOi+vu+8jFxuICAgKiAgbm90aWZpY2F0aW9uUmVjZWl2ZWRJbkFwcDog6YCa55+l5Yiw6L6+5omT5byAIGFwcFxuICAgKi9cbiAgdHlwZTogJ21lc3NhZ2UnIHwgJ25vdGlmaWNhdGlvbicgfCAnbm90aWZpY2F0aW9uT3BlbmVkJyB8ICdub3RpZmljYXRpb25SZWNlaXZlZCcgfCAnbm90aWZpY2F0aW9uUmVtb3ZlZCcgfCAnbm90aWZpY2F0aW9uQ2xpY2tlZFdpdGhOb0FjdGlvbicgfCAnbm90aWZpY2F0aW9uUmVjZWl2ZWRJbkFwcCc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBbGl5dW5Ob3RpZmljYXRpb24gZXh0ZW5kcyBBbGl5dW5NZXNzYWdlT3JpZ2luIHtcbiAgX0FMSVlVTl9OT1RJRklDQVRJT05fSURfPzogc3RyaW5nO1xufVxuZXhwb3J0IGludGVyZmFjZSBBbGl5dW5NZXNzYWdlIGV4dGVuZHMgQWxpeXVuTWVzc2FnZU9yaWdpbiB7XG4gIGlkPzogc3RyaW5nO1xuICBbcHJvcDogc3RyaW5nXTogYW55OyAgLy8g5ZCO5Y+w5o6o6YCB55qEIEV4dFBhcmFtZXRlcnMg5a2X5q61LOW3sui9rOS4uiBrZXktdmFsdWUg5b2i5byPXG59XG5cbmV4cG9ydCB0eXBlIE1lc3NhZ2UgPSBBbGl5dW5Ob3RpZmljYXRpb24gfCBBbGl5dW5NZXNzYWdlO1xuXG4vKipcbiAqIOebruagh+exu+Wei1xuICog6K+m5oOF5Y+C6ICDIOmYv+mHjOS6keenu+WKqOaOqOmAgeaWh+aho1xuICovXG5leHBvcnQgZW51bSBBbGl5dW5QdXNoVGFyZ2V0IHtcbiAgREVWSUNFX1RBUkdFVCA9IDEsICAvLyDmnKzorr7lpIdcbiAgQUNDT1VOVF9UQVJHRVQgPSAyLCAvLyDmnKzotKblj7dcbiAgQUxJQVNfVEFSR0VUID0gMyAgICAvLyDliKvlkI1cbn1cblxuXG4vKlxuKiBAbmFtZSBBbGl5dW4gUHVzaFxuKiBAZGVzY3JpcHRpb25cbiog6Zi/6YeM5LqR5o6o6YCBXG4qXG4qXG4qIEB1c2FnZVxuKiBgYGB0eXBlc2NyaXB0XG4qIGltcG9ydCB7IEFsaXl1blB1c2ggfSBmcm9tICdAaW9uaWMtbmF0aXZlL2FsaXl1bi1wdXNoL25neCc7XG4qIEBOZ01vZHVsZSh7XG4qICAgZGVjbGFyYXRpb25zOiBbQXBwQ29tcG9uZW50XSxcbiogICBlbnRyeUNvbXBvbmVudHM6IFtdLFxuKiAgIGltcG9ydHM6IFtCcm93c2VyTW9kdWxlLCBJb25pY01vZHVsZS5mb3JSb290KCksIEFwcFJvdXRpbmdNb2R1bGVdLFxuKiAgIHByb3ZpZGVyczogW1xuKiAgICAgU3RhdHVzQmFyLFxuKiAgICAgU3BsYXNoU2NyZWVuLFxuKiAgICAgeyBwcm92aWRlOiBSb3V0ZVJldXNlU3RyYXRlZ3ksIHVzZUNsYXNzOiBJb25pY1JvdXRlU3RyYXRlZ3kgfSxcbiogICAgIEFsaXl1blB1c2ggIDx+fn5+IOWumuS5iVxuKiAgIF0sXG4qICAgYm9vdHN0cmFwOiBbQXBwQ29tcG9uZW50XVxuKiB9KVxuKiBgYGBcblxuKiBgYGB0eXBlc2NyaXB0XG4qIGltcG9ydCB7IEFsaXl1blB1c2ggfSBmcm9tICdAaW9uaWMtbmF0aXZlL2FsaXl1bi1wdXNoL25neCc7XG4qIGNvbnN0cnVjdG9yKHByaXZhdGUgYWxpeXVuUHVzaDogQWxpeXVuUHVzaCkgeyB9XG4qIC4uLlxuKiB0aGlzLmFsaXl1blB1c2gub25NZXNzYWdlKClcbiogLnN1YnNjcmliZSgobXNnKSA9PiB7XG4qICAgY29uc29sZS5sb2cobXNnKTtcbiogfSwgY29uc29sZS5lcnJvcik7XG4qIGBgYFxuKi9cblxuXG5AUGx1Z2luKHtcbiAgcGx1Z2luTmFtZTogJ0FsaXl1blB1c2gnLFxuICBwbHVnaW46ICdjb3Jkb3ZhLXBsdWdpbi1hbGl5dW5wdXNoJyxcbiAgcGx1Z2luUmVmOiAnQWxpeXVuUHVzaCcsXG4gIHJlcG86ICdodHRwczovL2dpdGh1Yi5jb20vbG9nMmMvY29yZG92YS1wbHVnaW4tYWxpeXVucHVzaC5naXQnLFxuICBwbGF0Zm9ybXM6IFsnQW5kcm9pZCcsICdpT1MnXSxcbiAgaW5zdGFsbDogJycsXG4gIGluc3RhbGxWYXJpYWJsZXM6IFsnQU5EUk9JRF9BUFBfS0VZJywgJ0FORFJPSURfQVBQX1NFQ1JFVCcsICdJT1NfQVBQX0tFWScsICdJT1NfQVBQX1NFQ1JFVCcsICdIVUFXRUlfQVBQSUQnLCAnTUlQVVNIX0FQUElEJywgJ01JUFVTSF9BUFBLRVknXSxcbn0pXG5ASW5qZWN0YWJsZSgpXG5leHBvcnQgY2xhc3MgQWxpeXVuUHVzaCBleHRlbmRzIElvbmljTmF0aXZlUGx1Z2luIHtcblxuICBAQ29yZG92YSgpXG4gIGdldFJlZ2lzdGVySWQoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm47XG4gIH1cblxuICBAQ29yZG92YSgpXG4gIGJpbmRBY2NvdW50KGFjY291bnQ6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgQENvcmRvdmEoKVxuICB1bmJpbmRBY2NvdW50KCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLyoqXG4gICAqIOmYv+mHjOS6keaOqOmAgee7keWumuagh+etvlxuICAgKiBAcGFyYW0gdGFncyDmoIfnrb7liJfooahcbiAgICovXG4gIEBDb3Jkb3ZhKClcbiAgYmluZFRhZ3ModGFyZ2V0OiBBbGl5dW5QdXNoVGFyZ2V0LCB0YWdzOiBzdHJpbmdbXSwgYWxpYXM/OiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8qKlxuICAgKiDpmL/ph4zkupHmjqjpgIHop6PpmaTnu5HlrprmoIfnrb5cbiAgICogQHBhcmFtICB7c3RyaW5nW119IHRhZ3MgIOagh+etvuWIl+ihqFxuICAgKi9cbiAgQENvcmRvdmEoKVxuICB1bmJpbmRUYWdzKHRhcmdldDogQWxpeXVuUHVzaFRhcmdldCwgdGFnczogc3RyaW5nW10sIGFsaWFzPzogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvKipcbiAgICog6Zi/6YeM5LqR5o6o6YCB6Kej6Zmk57uR5a6a5qCH562+XG4gICAqL1xuICBAQ29yZG92YSgpXG4gIGxpc3RUYWdzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvKipcbiAgICog5rKh5pyJ5p2D6ZmQ5pe277yM6K+35rGC5byA6YCa6YCa55+l5p2D6ZmQ77yM5YW25LuW6Lev6L+HXG4gICAqIEBwYXJhbSAgc3RyaW5nIG1zZyAg6K+35rGC5p2D6ZmQ55qE5o+P6L+w5L+h5oGvXG4gICAqL1xuICBAQ29yZG92YSgpXG4gIHJlcXVpcmVOb3RpZnlQZXJtaXNzaW9uKG1zZzogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvKipcbiAgICog6Zi/6YeM5LqR5o6o6YCB5raI5oGv6YCP5Lyg5Zue6LCDXG4gICAqL1xuICBAQ29yZG92YSh7XG4gICAgb2JzZXJ2YWJsZTogdHJ1ZVxuICB9KVxuICBvbk1lc3NhZ2UoKTogT2JzZXJ2YWJsZTxNZXNzYWdlPiB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLyoqXG4gICAqIOa3u+WKoOWIq+WQjVxuICAgKiBAcGFyYW0gdGFncyDmoIfnrb7liJfooahcbiAgICovXG4gIEBDb3Jkb3ZhKClcbiAgYWRkQWxpYXMoYWxpYXM6IHN0cmluZyk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLyoqXG4gICAqIOenu+mZpOWIq+WQjVxuICAgKiBAcGFyYW0gYWxpYXMg5qCH562+5YiX6KGoXG4gICAqL1xuICBAQ29yZG92YSgpXG4gIHJlbW92ZUFsaWFzKGFsaWFzOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8qKlxuICAgKiDmn6Xor6Llt7Lms6jlhozliKvlkI1cbiAgICovXG4gIEBDb3Jkb3ZhKClcbiAgbGlzdEFsaWFzZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybjtcbiAgfVxuXG59XG4iXX0=