# Mock Server

一个轻量 mock 服务器，用于模拟第三方接口响应。

支持两种“随时编辑响应体”的方式：

1. 直接修改 `mocks.json`（服务会自动热加载）
2. 调用管理接口在线更新（会同步写回 `mocks.json`）

## 运行

```bash
npm start
```

默认端口：`3000`，可通过环境变量修改：

```bash
PORT=4000 npm start
```

启动后可直接打开管理页面：

- `http://localhost:3000/__admin`

页面能力：

- 新增/覆盖 mock 路由
- 删除 mock 路由
- 编辑 headers 与 body（JSON / 字符串 / 数字）
- 实时查看当前路由列表

## 路由配置（mocks.json）

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/api/user/profile",
      "status": 200,
      "headers": {
        "Content-Type": "application/json; charset=utf-8"
      },
      "body": {
        "id": "u_1001",
        "name": "Mock User"
      },
      "delayMs": 0
    }
  ]
}
```

字段说明：

- `method`: HTTP 方法（GET/POST/PUT/DELETE...）
- `path`: 精确匹配路径
- `status`: 响应状态码
- `headers`: 响应头
- `body`: 响应体（对象/数组/字符串/数字都可）
- `delayMs`: 延时返回（毫秒）

## 管理接口

- `GET /__admin/routes`：查看当前全部路由
- `PUT /__admin/route`：新增或覆盖一个路由
- `DELETE /__admin/route`：删除一个路由

### 在线更新响应体示例

```bash
curl -X PUT http://localhost:3000/__admin/route \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "path": "/api/user/profile",
    "status": 200,
    "body": {
      "id": "u_1001",
      "name": "Updated Name",
      "vip": false
    }
  }'
```

更新后，不需要重启服务，下一次请求即生效。

## 开发验证

```bash
npm run check
npm test
```
