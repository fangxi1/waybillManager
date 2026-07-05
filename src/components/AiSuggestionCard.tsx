"use client";

interface AiSuggestionProps {
  title?: string;
  reasoning: string;
  confidence: number;
  source: "ai" | "rule_based";
  extra?: React.ReactNode;
  references?: Array<{ ticketId: string; action: string; comment: string | null }>;
}

export function AiSuggestionCard({
  title = "AI 分析建议",
  reasoning,
  confidence,
  source,
  extra,
  references,
}: AiSuggestionProps) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--accent)] bg-[var(--accent-tint)] p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-[var(--accent-dark)]">{title}</span>
        <span className="badge bg-white text-[var(--accent-dark)]">
          {source === "ai" ? "大模型" : "规则引擎"} · {(confidence * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-[var(--ink-soft)]">{reasoning}</p>
      {extra}
      {references && references.length > 0 && (
        <div className="mt-2 text-xs text-[var(--ink-faint)]">
          <p className="font-medium">参考历史记录：</p>
          <ul className="mt-1 list-inside list-disc">
            {references.map((r) => (
              <li key={r.ticketId}>
                {r.ticketId.slice(0, 8)}… · {r.action}
                {r.comment ? ` · ${r.comment.slice(0, 30)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs font-medium text-amber-700">⚠ AI 建议，需人工确认</p>
    </div>
  );
}
