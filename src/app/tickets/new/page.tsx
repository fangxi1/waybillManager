"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOGISTICS_TYPES, LOGISTICS_TYPE_LABELS } from "@/lib/constants";
import { AiSuggestionCard } from "@/components/AiSuggestionCard";

interface ClassifyResult {
  suggestedType: string;
  typeLabel: string;
  severity: string;
  confidence: number;
  reasoning: string;
  source: "ai" | "rule_based";
}

export default function NewTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState({ waybillNo: "", type: "lost", description: "" });
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<ClassifyResult | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ waybillSource?: string; warning?: string } | null>(null);

  async function runAiClassify() {
    if (!form.description.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: form.description, category: "logistics" }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiResult(data);
        setForm((f) => ({ ...f, type: data.suggestedType }));
      }
    } finally {
      setAiLoading(false);
    }
  }

  async function submit() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setTimeout(() => router.push(`/tickets/${data.ticketId}`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上报失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold">物流异常上报</h1>
      <div className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">运单号 *</label>
          <input
            className="input"
            placeholder="V2 外部编码，如 PS2605290033"
            value={form.waybillNo}
            onChange={(e) => setForm({ ...form, waybillNo: e.target.value })}
          />
          <p className="mt-1 text-xs text-[var(--ink-soft)]">将通过 V2 接口实时校验运单真实性</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">异常描述 *</label>
          <textarea
            className="input min-h-[100px]"
            placeholder="请描述异常情况..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button
            type="button"
            className="btn-secondary mt-2 text-xs"
            disabled={aiLoading || !form.description.trim()}
            onClick={runAiClassify}
          >
            {aiLoading ? "AI 分析中..." : "🤖 AI 辅助分类"}
          </button>
        </div>

        {aiResult && (
          <AiSuggestionCard
            title="异常类型 AI 建议"
            reasoning={aiResult.reasoning}
            confidence={aiResult.confidence}
            source={aiResult.source}
            extra={
              <p className="mt-2">
                建议类型：<strong>{aiResult.typeLabel}</strong> · 严重度：{aiResult.severity}
              </p>
            }
          />
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">异常类型 *（可人工修改）</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {LOGISTICS_TYPES.map((t) => (
              <option key={t} value={t}>{LOGISTICS_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {result && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            上报成功！数据来源: {result.waybillSource === "live" ? "实时获取自 V2" : "本地缓存"}
            {result.warning && <p className="mt-1 text-amber-700">⚠ {result.warning}</p>}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading || !form.waybillNo || !form.description} onClick={submit}>
          {loading ? "校验并提交中..." : "提交上报"}
        </button>
      </div>
    </div>
  );
}
