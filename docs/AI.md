# 大模型调用说明

## 使用场景

| 环节 | 功能 | 是否自动执行 |
|------|------|-------------|
| 异常上报 | 根据描述文本推荐异常类型与严重度 | ❌ 仅建议，用户可修改 |
| 工单审批 | 参考历史审批记录给出审批建议 | ❌ 仅建议，审批人自行决定 |
| 扫描品控 | （预留）可根据描述推荐品控子类型 | ❌ 未自动执行 |

所有 AI 输出均标注 **「AI 建议，需人工确认」**。

## 配置

```env
OPENAI_API_KEY=sk-...           # OpenAI 或兼容 API 的 Key
AI_API_BASE_URL=https://api.openai.com/v1   # 可选，兼容 DeepSeek/通义等
AI_MODEL=gpt-4o-mini            # 可选，默认 gpt-4o-mini
```

## Prompt 设计

### 异常分类
- System：限定可选异常类型枚举，要求返回 JSON `{type, severity, confidence, reasoning}`
- User：传入 `category` + `description`
- 人工可在下拉框中覆盖 AI 推荐的类型

### 审批建议
- System：要求返回 `{suggestion, confidence, reasoning}`，reasoning 需说明参考了哪些历史记录
- User：传入当前工单信息 + 最多 5 条同类型历史审批记录摘要
- 审批人看到的建议卡片列出参考的工单 ID 和审批动作

## 降级策略

1. 未配置 API Key → 使用关键词规则引擎
2. API 超时（3 秒）→ 降级规则引擎
3. API 返回非法 JSON → 降级规则引擎
4. 任何 AI 失败**不阻塞**上报/审批主流程

## API 端点

- `POST /api/ai/classify` — 异常分类建议
- `GET /api/ai/approval-suggestion?ticketId=xxx` — 审批建议（需审批权限）
