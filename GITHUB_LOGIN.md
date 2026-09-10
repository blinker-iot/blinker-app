# GitHub 登录联调

当前接入 Android/iOS 原生 App。浏览器预览中的 GitHub 按钮会提示使用手机 App。

## 服务端配置

Aily Auth 的生产配置文件为 `conf/auth.env`，开发配置文件为 `services/auth/.env`：

```dotenv
GITHUB_BLINKER_CLIENT_ID=填写独立应用的ClientID
GITHUB_BLINKER_CLIENT_SECRET=填写独立应用的ClientSecret
GITHUB_BLINKER_REDIRECT_URI=tech.diandeng.iot://auth/github
```

Client Secret 仅配置在认证服务端。GitHub OAuth App 注册的回调必须与上述地址一致。

Blinker Gateway 固定向 Aily 发送 `client_type="blinker"`。调通期间，在 Gateway 实际加载的环境中设置 `AILY_GITHUB_LOGIN_BIND_PROVIDER=none`；正常国内规则使用 `auto`。仅有未被进程加载的 `.env.local` 文件不会生效。

CN 的 GitHub 桥接服务必须接受 `blinker`，使用请求中的独立凭据，并向 GitHub 转发 `code_verifier` 和 `redirect_uri`。本地模拟测试不能代替该链路的实测。

## App 构建

使用 package.json 要求的 Node 版本（例如 22.23.2），执行 `npm install`，然后 `npm run build`。原生工程已包含 Browser 插件及回调配置；更新 Web 资源或插件后执行对应平台的 `npx cap sync android` 或 `npx cap sync ios`，再通过 Android Studio / Xcode 构建安装。

App 的 `environment.gatewayBaseUrl` 必须是手机可访问的 Gateway 地址；手机的 `127.0.0.1` 指向手机自身。

## 实机验收

1. 点击 GitHub，完成浏览器授权；返回 App 后显示当前账号与设备。
2. 授权期间结束 App 进程，再完成授权；冷启动回跳仍可完成登录。
3. 在 GitHub 拒绝授权，或关闭授权浏览器；App 不进入登录成功状态，可重新点击登录。
4. 已建立登录或退出后，旧回调不能覆盖当前会话；重复回调只换码一次。
5. 恢复 `auto` 且服务端要求微信绑定时，App 显示绑定要求，不把待绑定响应当作登录成功。本次未增加微信待绑定完成页面。

App 使用系统浏览器、S256 PKCE、原生安全存储和十分钟授权有效期。有效回调会先消费授权状态，再换取完整的 Aily token pair；不把 token 或 verifier 存入 localStorage。

原生浏览器的隐藏事件可能先于授权回跳，因此没有将浏览器隐藏直接当作取消。重新发起登录会替换旧授权，其他登录方式成功或退出会清理待授权信息。
