# Vercel 部署指南

## 架构

```
┌──────────────────────────────┐     HTTP API      ┌─────────────────────────────┐
│  V2 (universal-import-v2)    │ ◄──────────────── │  V3 (waybill-manager-v3)    │
│  Vercel + Postgres (Neon)    │   X-API-Key       │  Vercel + Turso (libSQL)    │
│  /api/integration/*          │                   │  异常工单 / 审批 / 品控     │
└──────────────────────────────┘                   └─────────────────────────────┘
```

V2 源码：[fangxi1/universal-import-v2](https://github.com/fangxi1/universal-import-v2)

## 第一步：部署 V2

```bash
cd universal-import-v2
npm install
npx vercel login
npx vercel --prod
```

在 Vercel Dashboard → Settings → Environment Variables 配置：

| 变量 | 值 |
|------|-----|
| `POSTGRES_URL` | Neon/Vercel Postgres 连接串 |
| `INTEGRATION_API_KEY` | `waybill-v3-secret-key`（与 V3 的 `V2_API_KEY` 一致） |

记录 V2 生产 URL，例如：

`https://universal-import-v2-fangxi1s-projects.vercel.app`

**重要**：V2 需先在 `/import` 页面导入订单，V3 才能校验运单、扫描、上报。

## 第二步：创建 Turso 数据库（V3）

1. 注册 [Turso](https://turso.tech)
2. 创建数据库 `waybill-v3`
3. 获取 `DATABASE_URL` 和 `DATABASE_AUTH_TOKEN`

或使用脚本：`scripts/setup-turso-production.ps1`

## 第三步：部署 V3

```bash
cd waybillManager
npm install
npx vercel --prod
```

在 Vercel Dashboard → Settings → Environment Variables 配置：

| 变量 | 值 |
|------|-----|
| `DATABASE_URL` | `libsql://...` |
| `DATABASE_AUTH_TOKEN` | Turso token |
| `V2_API_BASE_URL` | `https://<v2-host>/api/integration` |
| `V2_API_KEY` | `waybill-v3-secret-key` |
| `CRON_SECRET` | 随机强密码 |
| `CURSOR_API_KEY` | （可选）Cursor 生成的 Key，`crsr_...` 开头，启用线上 AI |
| `CURSOR_MODEL` | （可选）默认 `composer-2.5` |
| `OPENAI_API_KEY` | （可选）OpenAI 兼容 API，作为 Cursor 的备选 |

## 第四步：初始化生产数据库

部署完成后执行一次：

```bash
curl -X POST https://waybill-manager-v3.vercel.app/api/admin/init-db \
  -H "Authorization: Bearer <CRON_SECRET>"
```

或在本地设置生产环境变量后：

```bash
npm run db:migrate && npm run db:seed
```

种子数据会从 V2 拉取运单快照；若 V2 无订单则跳过 220 条工单种子。

## 第五步：验证

1. 在 V2 `/import` 导入测试订单（含 `externalCode`、`skuCode`）
2. 打开 V3 `/sync`，确认 V2 接口调用成功
3. 测试扫描品控（运单号 = V2 `externalCode`，如 `PS2605290033`）
4. 测试异常上报 + 分级审批 + AI 建议（可选）

## 本地联调

```bash
# 终端 1：V2 (3000)
cd universal-import-v2
# .env.local: INTEGRATION_API_KEY=waybill-v3-secret-key
npm run dev

# 终端 2：V3 (3001)
cd waybillManager
# .env: V2_API_BASE_URL=http://localhost:3000/api/integration
npm run dev -- -p 3001
```

## AI 功能（可选）

**本地**：在 `.env.local` 配置 `CURSOR_API_KEY`（`crsr_...`）。

**线上 Vercel**：在 Dashboard → Environment Variables 添加 `CURSOR_API_KEY` 和 `CURSOR_MODEL=composer-2.5`，然后 Redeploy。详见 [docs/VERCEL_AI.md](VERCEL_AI.md)。

- 异常上报页：「AI 辅助分类」
- 扫描页：「AI 辅助判定品控子类型」
- 工单详情页：审批人可见「审批 AI 建议」

未配置或调用失败时自动降级为规则引擎，不阻塞主流程。

> **注意**：Vercel Hobby 套餐函数超时 10 秒，Cursor 分析约 15 秒，线上可能仍显示「规则引擎」。升级 Pro 套餐后可稳定使用大模型。

详见 `docs/AI.md`。
