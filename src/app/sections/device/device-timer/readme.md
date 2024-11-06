# 定时任务

## 数据库设计
```json
{
    "id":"uuid",
    "deviceId":"XXXXXXXXXXXXXXXX",
    "userId":"",
    "enable": 1,
    "rule": "*/1 * * * *",
    "action": [],
    "lastDate":"",
    "nextDate":"",
    "createdDate":"",
    "type":"0 定时/1 倒计时"
}
```

## 执行逻辑
1. 每分钟查询一次nextDate在未来1分钟的要执行的任务
2. 将查出的任务放进任务队列
3. 发送任务队列中动作到指定设备
4. 创建写入数据库任务，到写数据库队列
5. 写入数据库，更新lastDate, nextDate

## 接口
### 获取任务
GET /<deviceID>/task

### 添加任务/修改任务
POST /<deviceID>/task

### 删除任务
DELETE /<deviceID>/task
