# 大模型调用说明

## 使用场景

| 环节 | 功能 | 是否自动执行 |
|------|------|-------------|
| 异常上报 | 根据描述文本推荐异常类型与严重度 | ❌ 仅建议，用户可修改 |
| 工单审批 | 参考历史审批记录给出审批建议 | ❌ 仅建议，审批人自行决定 |
| 扫描品控 | 根据扫描数据推荐品控子类型 | ❌ 仅建议，实际判定由规则引擎 |

所有 AI 输出均标注 **「AI 建议，需人工确认」**。

## 配置

### 方式一：Cursor API Key（当前推荐）

在 Cursor 设置中生成 API Key（`crsr_...` 开头），写入 `.env.local`：

```env
CURSOR_API_KEY=crsr_...
CURSOR_MODEL=composer-2.5
```

- 使用 Cursor SDK（`@cursor/sdk`）调用 **composer-2.5** 模型
- 单次分析约 10—20 秒，API 路由已设置 `maxDuration = 60`
- 适用于本地开发（`npm run dev`）

### 方式二：OpenAI 兼容 API

```env
OPENAI_API_KEY=sk-...
AI_API_BASE_URL=https://api.openai.com/v1   # 可选，兼容 DeepSeek/通义等
AI_MODEL=gpt-4o-mini                        # 可选
```

## 优先级

1. 配置了 `CURSOR_API_KEY` → 使用 Cursor **composer-2.5**
2. 配置了 `OPENAI_API_KEY` / `AI_API_KEY` → 使用 OpenAI 兼容接口
3. 均未配置或调用失败 → 降级为关键词规则引擎

## 降级策略

1. 未配置任何 API Key → 使用关键词规则引擎
2. Cursor / OpenAI 调用失败 → 降级规则引擎
3. 返回非法 JSON → 降级规则引擎
4. 任何 AI 失败**不阻塞**上报/审批主流程

## API 端点

- `POST /api/ai/classify` — 异常分类建议
- `GET /api/ai/approval-suggestion?ticketId=xxx` — 审批建议（需审批权限）

## 注意事项

- **请勿将 API Key 提交到 Git**，应放在 `.env.local`（已加入 `.gitignore`）
- **Vercel 线上**：在 Dashboard → Settings → Environment Variables 配置 `CURSOR_API_KEY` 和 `CURSOR_MODEL`，详见 [docs/VERCEL_AI.md](VERCEL_AI.md)
- Cursor SDK 依赖 Node.js 运行时；Hobby 套餐函数超时 10 秒，Cursor 分析约 15 秒，线上可能降级为规则引擎；Pro 套餐（60 秒）可稳定使用
