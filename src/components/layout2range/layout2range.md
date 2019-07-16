# layout2range  
拖拽滑块发送数据，或接受数据改变滑块位置  
## 发送数据  
```json
{"ran-abc":30}
```
## 可接收内容：  
value,color
### 示例：  
```json
{"num-abc":30} 等效 {"btn-abc":[30]}  
{"num-abc":[99,"#FFFFFF"]}  
{"num-abc":[,"#FFFFFF"]}  
```