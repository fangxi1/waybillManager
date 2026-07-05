import {
  LOGISTICS_TYPE_LABELS,
  LOGISTICS_TYPES,
  QC_TYPE_LABELS,
  QC_TYPES,
} from "./constants";

export const AI_DISCLAIMER = "AI 建议，需人工确认";

export interface AiClassifyResult {
  suggestedType: string;
  typeLabel: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  reasoning: string;
  source: "ai" | "rule_based";
  disclaimer: string;
}

export interface AiApprovalSuggestion {
  suggestion: "approve" | "reject" | "escalate";
  suggestionLabel: string;
  confidence: number;
  reasoning: string;
  referenceRecords: Array<{ ticketId: string; action: string; comment: string | null }>;
  source: "ai" | "rule_based";
  disclaimer: string;
}

const AI_TIMEOUT_MS = 3000;

function isAiEnabled() {
  return !!(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
}

async function callLlm(prompt: string, system: string): Promise<string | null> {
  if (!isAiEnabled()) return null;

  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json.choices?.[0]?.message?.content || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function ruleBasedClassify(description: string, category: "logistics" | "qc"): AiClassifyResult {
  const text = description.toLowerCase();
  const types = category === "logistics" ? LOGISTICS_TYPES : QC_TYPES;
  const labels = category === "logistics" ? LOGISTICS_TYPE_LABELS : QC_TYPE_LABELS;

  const rules: Array<{ type: string; keywords: string[]; severity: AiClassifyResult["severity"] }> =
    category === "logistics"
      ? [
          { type: "lost", keywords: ["丢", "丢失", "找不到", "未收到"], severity: "high" },
          { type: "damaged", keywords: ["破", "损坏", "变形", "漏", "碎"], severity: "high" },
          { type: "rejected", keywords: ["拒收", "不要", "退回"], severity: "medium" },
          { type: "timeout_unsigned", keywords: ["超时", "未签收", "迟迟"], severity: "medium" },
          { type: "address_error", keywords: ["地址", "门牌", "小区", "错"], severity: "low" },
        ]
      : [
          { type: "quantity_mismatch", keywords: ["数量", "缺", "少", "多"], severity: "high" },
          { type: "appearance_damage", keywords: ["破", "外观", "损坏"], severity: "critical" },
          { type: "spec_mismatch", keywords: ["规格", "型号", "尺寸"], severity: "medium" },
          { type: "label_error", keywords: ["标签", "贴标", "条码"], severity: "low" },
          { type: "batch_anomaly", keywords: ["批次", "生产日期", "过期"], severity: "high" },
        ];

  let best: { type: string; score: number; severity: AiClassifyResult["severity"] } = {
    type: types[0],
    score: 0,
    severity: "medium",
  };
  for (const rule of rules) {
    const score = rule.keywords.filter((k) => text.includes(k)).length;
    if (score > best.score) best = { type: rule.type, score, severity: rule.severity };
  }

  return {
    suggestedType: best.type,
    typeLabel: labels[best.type] || best.type,
    severity: best.score > 0 ? best.severity : "medium",
    confidence: best.score > 0 ? Math.min(0.85, 0.5 + best.score * 0.15) : 0.4,
    reasoning: best.score > 0
      ? `规则引擎：描述中包含与「${labels[best.type]}」相关的关键词`
      : "规则引擎：未命中明确关键词，返回默认类型",
    source: "rule_based",
    disclaimer: AI_DISCLAIMER,
  };
}

export async function classifyException(
  description: string,
  category: "logistics" | "qc"
): Promise<AiClassifyResult> {
  const types = category === "logistics" ? LOGISTICS_TYPES : QC_TYPES;
  const labels = category === "logistics" ? LOGISTICS_TYPE_LABELS : QC_TYPE_LABELS;

  const system = `你是冷链物流异常分类助手。根据描述判断异常类型与严重度。
可选类型: ${types.join(", ")}
返回 JSON: {"type":"...", "severity":"low|medium|high|critical", "confidence":0-1, "reasoning":"..."}`;

  const raw = await callLlm(`异常类别: ${category}\n描述: ${description}`, system);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if ((types as readonly string[]).includes(parsed.type)) {
        return {
          suggestedType: parsed.type,
          typeLabel: labels[parsed.type] || parsed.type,
          severity: parsed.severity || "medium",
          confidence: Number(parsed.confidence) || 0.7,
          reasoning: `大模型分析：${parsed.reasoning || "基于语义理解"}`,
          source: "ai",
          disclaimer: AI_DISCLAIMER,
        };
      }
    } catch {
      /* fallback */
    }
  }

  return ruleBasedClassify(description, category);
}

export async function suggestApproval(params: {
  type: string;
  category: string;
  amount: number;
  description: string;
  historyRecords: Array<{
    ticketId: string;
    type: string;
    action: string;
    comment: string | null;
    amount: number;
  }>;
}): Promise<AiApprovalSuggestion> {
  const refs = params.historyRecords
    .filter((r) => r.type === params.type)
    .slice(0, 5);

  const approveCount = refs.filter((r) => r.action === "approve").length;
  const rejectCount = refs.filter((r) => r.action === "reject").length;

  const ruleSuggestion: AiApprovalSuggestion = {
    suggestion: approveCount >= rejectCount ? "approve" : "reject",
    suggestionLabel: approveCount >= rejectCount ? "建议通过" : "建议拒绝",
    confidence: refs.length > 0 ? 0.6 : 0.45,
    reasoning:
      refs.length > 0
        ? `规则引擎：参考 ${refs.length} 条同类型历史记录（通过 ${approveCount} / 拒绝 ${rejectCount}）`
        : "规则引擎：无足够历史记录，建议人工审慎判断",
    referenceRecords: refs.map((r) => ({
      ticketId: r.ticketId,
      action: r.action,
      comment: r.comment,
    })),
    source: "rule_based",
    disclaimer: AI_DISCLAIMER,
  };

  if (!isAiEnabled()) return ruleSuggestion;

  const refText = refs
    .map((r, i) => `${i + 1}. 工单${r.ticketId.slice(0, 8)} 金额${r.amount} ${r.action} "${r.comment || ""}"`)
    .join("\n");

  const system = `你是审批助手。根据工单信息和历史审批给出建议。
返回 JSON: {"suggestion":"approve|reject|escalate", "confidence":0-1, "reasoning":"需说明参考了哪些历史记录"}`;

  const raw = await callLlm(
    `类型: ${params.type}\n类别: ${params.category}\n金额: ${params.amount}\n描述: ${params.description}\n\n历史记录:\n${refText || "无"}`,
    system
  );

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const map: Record<string, string> = {
        approve: "建议通过",
        reject: "建议拒绝",
        escalate: "建议升级",
      };
      return {
        suggestion: parsed.suggestion || ruleSuggestion.suggestion,
        suggestionLabel: map[parsed.suggestion] || ruleSuggestion.suggestionLabel,
        confidence: Number(parsed.confidence) || 0.75,
        reasoning: `大模型分析：${parsed.reasoning}（参考了 ${refs.length} 条历史审批记录）`,
        referenceRecords: ruleSuggestion.referenceRecords,
        source: "ai",
        disclaimer: AI_DISCLAIMER,
      };
    } catch {
      /* fallback */
    }
  }

  return ruleSuggestion;
}
