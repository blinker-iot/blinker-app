# GitHub 登录排查计划

## Intent：最终目标

定位本地 Web 模式 GitHub 登录的 404 原因，明确可验证的修复边界。

## Data：可用证据

- 用户截图：GET /api/v1/user/oauth/github 返回 404。
- App：loginWithGithub 直接请求旧接口，期待 message=1000 和 detail.uuid/token。
- Gateway：现行认证路由清单及 AilyClient 上游配置。

## Edges：边界与限制

- 不猜测 OAuth 地址、回调契约或令牌格式。
- 不把反馈功能使用的 GitHub Token 接口当作登录接口。
- 不新增测试、不使用浏览器验证 UI；不擅自删除登录入口。

## Answer：交付与成功标准

1. 复现 HTTP 响应，确认请求到达本地 Gateway。
2. 对照前后端认证契约，定位缺失环节。
3. 若存在对应接口，做最小适配；若契约缺失，先向用户确认。
4. 完整修复必须验证授权、回调、会话建立，而非只消除 404。

```mermaid
flowchart LR
    Web[Web App] --> Gateway[本地 Gateway]
    Gateway --> Aily[Aily 账号服务]
    Aily -. GitHub 授权契约待确认 .-> GitHub[GitHub]
```
