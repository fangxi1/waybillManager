# V3 ↔ V2（universal-import-v2）系统间接口文档

## 概述

V3 调用 V2（[universal-import-v2](https://github.com/fangxi1/universal-import-v2)）的 **集成 API**，不直连 V2 数据库。

| V2 概念 | V3 概念 | 字段映射 |
|---------|---------|----------|
| `orders.external_code` | 运单号 `waybillNo` | 外部编码 / 配送单号 |
| `orders.sku_code` | SKU | SKU物品编码 |
| `orders.store_name` | 仓库 `warehouseId` | 收货门店 |
| 多行 SKU 明细 | 运单快照 `skus[]` | V2 按 externalCode 聚合 |

## 鉴权

```
X-API-Key: <与 V2 的 INTEGRATION_API_KEY 一致>
```

V2 环境变量：`INTEGRATION_API_KEY`（或 `V2_API_KEY`）

若 V2 部署在 Vercel 且开启了 **Deployment Protection**，V3 还需配置：

```
V2_VERCEL_BYPASS_SECRET=<V2 项目 Settings → Deployment Protection → Protection Bypass for Automation>
```

V3 环境变量：
```
V2_API_BASE_URL=https://<v2-host>/api/integration
V2_API_KEY=waybill-v3-secret-key
V2_VERCEL_BYPASS_SECRET=<32位 bypass secret，V2 开启部署保护时必填>
```

## 接口列表

### 1. 运单列表（聚合）

```
GET /waybills?page=1&pageSize=50&warehouseId=门店名
```

按 `external_code` 聚合 V2 `orders` 表多行 SKU 为运单头。

### 2. 运单详情（实时校验）

```
GET /waybills/{externalCode}
```

404 = 运单不存在。V3 异常上报/扫描时**必须**调用此接口。

### 3. SKU 归属校验

```
GET /waybills/{externalCode}/skus/{skuCode}/validate
```

响应：`{ "valid": true, "waybillNo": "...", "sku": "..." }`

### 4. 异常状态回写（加分项）

```
POST /waybills/{externalCode}/exception-flag
{ "hasOpenException": true, "ticketId": "...", "status": "pending" }
```

## 本地联调

```bash
# 终端 1：V2 (port 3000)
cd universal-import-v2
# .env.local 添加 INTEGRATION_API_KEY=waybill-v3-secret-key
npm run dev

# 终端 2：V3 (port 3001)
cd waybillManager
# .env: V2_API_BASE_URL=http://localhost:3000/api/integration
npm run dev -- -p 3001
```

## 降级策略

V2 不可用时，V3 使用 `waybill_snapshots` 本地缓存，前端标注「使用本地缓存，同步于 XX 时间」。

## 金额估算

V2 订单无金额字段，集成 API 按 `重量 × 数量 × 单价系数` 估算运单金额，供 V3 分级审批使用。
