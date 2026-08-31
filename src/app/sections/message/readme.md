# 消息中心模块

本模块消费 Gateway 的 V2 站内信接口。服务端 `title/body` 是展示事实源，`type/category` 是开放字符串；
未知值必须继续展示为通用消息，不推测 URL、设备 ID 或分享 ID。

## 接口与鉴权

所有请求复用 App 的业务 Bearer token，并解析统一的 `{ status, data }` envelope：

- `GET /api/v2/messages`
- `GET /api/v2/messages/unread-summary`
- `GET /api/v2/messages/:id`
- `POST /api/v2/messages/:id:read`
- `POST /api/v2/messages:mark-all-read`
- `DELETE /api/v2/messages/:id`

列表保持服务端顺序，opaque `nextCursor` 仅透传；追加页按稳定 `message.id` 去重。全部已读每次先取得最新
summary，再原样提交其 `beforeCursor`，避免误读快照之后到达的新消息。

## 状态边界

- 服务状态按 `DataService.sessionEpoch` 隔离；退出或切换账号会清空消息、cursor、summary 和请求上下文。
- detail/read/delete 的统一 `404 MESSAGE_NOT_FOUND` 收敛为本地移除并返回 `null`，不暴露消息是否属于其他账号。
- 页面区分首次加载、空态、保留列表的错误重试、下拉刷新和 cursor 加载更多；详情打开后回源并标记已读。
- Profile 未读徽标使用 `unread-summary.total`，大于 99 时显示 `99+`。

## Android 提醒

Android ntfy 提醒只携带/解析消息 ID，用于触发 summary/list 刷新。提醒正文不是业务事实源；详情、已读和删除
仍必须使用当前账号的 Bearer token 回源。提醒不可用不得阻断站内信列表。

## 联调前置

联调环境需启用 Gateway Message Center、完成数据库迁移，并准备两个相互隔离的测试账号。开始前确认账号消息
基线和 feature flag；按服务端接入文档验证收件人、分页、未读快照、交叉账号 404 和删除闭环。本文仅描述当前实现，
不代表已完成实机或最终联合测试。
