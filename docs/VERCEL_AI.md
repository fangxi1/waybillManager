# 在 Vercel 启用 Cursor AI

## 方式一：Dashboard 手动配置（推荐）

1. 打开 [Vercel Dashboard](https://vercel.com/dashboard) → 项目 **waybill-manager-v3**
2. **Settings** → **Environment Variables**
3. 添加以下变量（Environment 勾选 **Production**、**Preview**、**Development**）：

| Name | Value |
|------|-------|
| `CURSOR_API_KEY` | 你的 `crsr_...` Key |
| `CURSOR_MODEL` | `composer-2.5` |

4. **Deployments** → 最新部署 → **⋯** → **Redeploy**（勾选 Clear Build Cache 可选）

配置完成后，访问线上站点点击「AI 辅助分类」等按钮即可。

## 方式二：Vercel CLI

```powershell
# 需先登录：npx vercel login
cd D:\ideaProject\waybillManager

# 从 .env.local 读取并写入 Vercel（勿将 Key 提交到 Git）
$key = (Get-Content .env.local | Where-Object { $_ -match '^CURSOR_API_KEY=' }) -replace '^CURSOR_API_KEY=',''
$model = (Get-Content .env.local | Where-Object { $_ -match '^CURSOR_MODEL=' }) -replace '^CURSOR_MODEL=',''
if (-not $model) { $model = 'composer-2.5' }

$key | npx vercel env add CURSOR_API_KEY production
$key | npx vercel env add CURSOR_API_KEY preview
$key | npx vercel env add CURSOR_API_KEY development

$model | npx vercel env add CURSOR_MODEL production
$model | npx vercel env add CURSOR_MODEL preview
$model | npx vercel env add CURSOR_MODEL development

npx vercel --prod
```

## 重要说明

| 项目 | 说明 |
|------|------|
| **Hobby 套餐超时** | Serverless 函数最长 **10 秒**；Cursor 单次分析约 15 秒，线上可能超时并**自动降级为规则引擎** |
| **Pro 套餐** | 函数最长 60 秒，与代码中 `maxDuration = 60` 匹配，Cursor AI 可稳定运行 |
| **安全** | 仅通过 Vercel Environment Variables 配置，不要写入代码仓库 |
| **代码依赖** | 需已部署含 `@cursor/sdk` 集成的版本（`next.config.ts` 中 `serverExternalPackages`） |

若 Hobby 套餐下线上 AI 仍显示「规则引擎」，可升级 Vercel Pro，或改用响应更快的 `OPENAI_API_KEY`。
