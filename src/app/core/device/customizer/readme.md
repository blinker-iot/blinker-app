# Customizer可用指令

## 发送数据  

``` js
{
    send: {
        key: value
    }
}
```

## 获取云端存储  

``` js
{
    get: {
        storage: {
            type: 'tsdata',
            key: 'xxx',
            quickCode: '1h' //1h,1d,1w,1m
        }
    }
}
```

``` js
{
    get: {
        storage: {
            type: 'config'
        }
    }
}
```

