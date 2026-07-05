# 运单全流程管理系统 V3

独立部署的运单全生命周期管理平台，覆盖：**录单同步 → 扫描品控 → 异常上报 → 分级审批 → 执行联动**。

## 技术栈

- Next.js 15 (App Router) + TypeScript
- Drizzle ORM + libSQL (Turso/SQLite)
- Tailwind CSS 4
- 主色 `#0FC6C2`（鲸天系统风格）

## 快速开始

```bash
npm install
npm run db:seed    # 初始化数据库；从 V2 同步运单后生成工单（需 V2 已导入订单）
npm run dev        # http://localhost:3000
```

首次访问请在右上角切换角色（默认无登录，选择用户后生效）。

### 测试账号

| 角色 | 用户 | 权限 |
|------|------|------|
| 异常上报员 | 李明 | 扫描、上报 |
| 一级审批人 | 王芳 | 一级审批 |
| 二级审批人 | 张总 | 二级审批 |
| 品控主管 | 陈主管 | 快速放行 |
| 系统管理员 | 系统管理员 | 全部权限 |

## 核心功能

- **扫描品控**：V2 接口校验 SKU → 品控规则引擎 → 暂扣/出库
- **异常上报**：实时 V2 校验运单真实性，手工上报物流异常
- **分级审批**：可配置金额阈值，一级/二级审批，超时自动流转
- **执行联动**：赔付（区分赔付方向）、库存变更，事务一致性
- **接口监控**：Request ID 全链路追踪，V2 降级方案
- **品控主管快速放行**：误判复核，留痕记录

## V2 对接（universal-import-v2）

V3 通过 HTTP 调用真实 V2 项目 [universal-import-v2](https://github.com/fangxi1/universal-import-v2) 的集成 API：

- 运单号 = V2 `externalCode`（外部编码）
- SKU = V2 `skuCode`
- 详见 [docs/V2_API.md](docs/V2_API.md)

本地联调：

```bash
# V2 (3000)
cd ../universal-import-v2 && npm run dev

# V3 (3001)，.env 中 V2_API_BASE_URL=http://localhost:3000/api/integration
npm run dev -- -p 3001
```

V2 需配置 `INTEGRATION_API_KEY=waybill-v3-secret-key`。

## AI 加分项

见 [docs/AI.md](docs/AI.md)。配置 `OPENAI_API_KEY` 启用大模型，未配置时使用规则引擎降级。

## 文档

- [需求理解与假设说明](docs/ASSUMPTIONS.md) — 九项留白规则的具体设定
- [V2 接口文档](docs/V2_API.md) — 跨系统接口契约

## 项目结构

```
src/
├── app/           # 页面 + API 路由
├── components/    # UI 组件
├── db/            # Schema + Seed
└── lib/           # 业务逻辑（状态机、品控引擎、V2 客户端）
```
