# 消息盒子模块  
所有消息都存放在统一数据库中，  
每条有唯一的id，  
用户messagebox里只存储id，  
删除消息时，只删除用户  

## 消息示例  
```json
{
    "id":"",
    "type":"news/system/device/user",
    "source":"设备ID，或者用户ID",
    "title":"",
    "summary":"",
    "date":222222,
    "icon":"",
    "url":"",
}
```

### 消息类型  
**news:**由管理后台发布的信息，如新闻、公告一类的信息  
**system:**由系统的发起的信息，没想好有啥  
**device:**由设备发起的信息，如推送通知  
**user：**由其他用户发起的信息，如设备分享  

### URL
如果url带有**https://**则打开文档加载组件，加载这个地址里的文档;  
如果不带，说明是一个应用内地址，如"share-manager"  

## 消息限制  
容量 100条，  
存储时间 1年，  
每页 10条，  

## 删除消息  
删除一条消息  
```
DELETE /user/message/:id 
```
删除所有消息  
```
DELETE /user/message/all
```
