"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  TICKET_STATUS_LABELS,
  LOGISTICS_TYPE_LABELS,
  QC_TYPE_LABELS,
  ROLE_LABELS,
} from "@/lib/constants";

import { AiSuggestionCard } from "@/components/AiSuggestionCard";

interface AiApproval {
  suggestion: string;
  suggestionLabel: string;
  confidence: number;
  reasoning: string;
  source: "ai" | "rule_based";
  referenceRecords?: Array<{ ticketId: string; action: string; comment: string | null }>;
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [comment, setComment] = useState("");
  const [fastReason, setFastReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [aiApproval, setAiApproval] = useState<AiApproval | null>(null);

  const load = useCallback(async () => {
    const [detail, session] = await Promise.all([
      fetch(`/api/tickets/${id}`).then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()),
    ]);
    setData(detail);
    setUser(session.currentUser);

    const canApprove =
      session.currentUser &&
      ["approver_l1", "approver_l2", "admin"].includes(session.currentUser.role) &&
      detail.ticket?.reporterId !== session.currentUser.id &&
      ["pending", "level1_review", "level2_review"].includes(detail.ticket?.status);

    if (canApprove) {
      fetch(`/api/ai/approval-suggestion?ticketId=${id}`)
        .then((r) => r.json())
        .then((d) => { if (d.reasoning) setAiApproval(d); })
        .catch(() => {});
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/tickets/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment,
          idempotencyKey: `${user?.id}_${action}_${id}`,
          ...extra,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (result.amountWarning) setNotice(result.amountWarning);
      setConfirmAction(null);
      setComment("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  if (!data?.ticket) return <div className="py-12 text-center">加载中...</div>;

  const ticket = data.ticket as Record<string, unknown>;
  const waybill = data.waybill as Record<string, unknown>;
  const snapshot = waybill?.snapshot as Record<string, unknown> | null;
  const approvals = (data.approvals || []) as Array<Record<string, unknown>>;
  const history = (data.history || []) as Array<Record<string, unknown>>;
  const compensations = (data.compensations || []) as Array<Record<string, unknown>>;

  const isReporter = user?.id === ticket.reporterId;
  const canL1 = user?.role === "approver_l1" || user?.role === "admin";
  const canL2 = user?.role === "approver_l2" || user?.role === "admin";
  const canQC = user?.role === "qc_supervisor" || user?.role === "admin";

  const typeLabel =
    ticket.category === "qc"
      ? QC_TYPE_LABELS[ticket.type as string]
      : LOGISTICS_TYPE_LABELS[ticket.type as string];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">工单详情</h1>
      <p className="mb-6 font-mono text-sm text-[var(--ink-soft)]">{ticket.id as string}</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{notice}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">基本信息</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-[var(--ink-soft)]">运单号</dt><dd className="font-medium">{ticket.waybillNo as string}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">状态</dt><dd>{TICKET_STATUS_LABELS[ticket.status as string]}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">类别</dt><dd>{ticket.category === "qc" ? "品控异常" : "物流异常"}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">类型</dt><dd>{typeLabel}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">来源</dt><dd>{ticket.source === "scan" ? "扫描触发" : "手工上报"}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">金额</dt><dd>¥{(ticket.amount as number).toFixed(2)}</dd></div>
              <div className="col-span-2"><dt className="text-[var(--ink-soft)]">描述</dt><dd>{ticket.description as string}</dd></div>
            </dl>
          </div>

          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">运单信息</h2>
            <div className="mb-3 rounded-lg bg-[var(--accent-tint)] p-3 text-xs">
              数据来源: {waybill.source === "live" ? "✅ 实时获取自 V2" : "⚠ 使用本地缓存"}
              {!!waybill.syncedAt && ` · 同步于 ${new Date(waybill.syncedAt as string).toLocaleString("zh-CN")}`}
              {!!waybill.warning && <p className="mt-1 text-amber-700">{waybill.warning as string}</p>}
            </div>
            {snapshot && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-[var(--ink-soft)]">发货方</dt><dd>{snapshot.senderSummary as string}</dd></div>
                <div><dt className="text-[var(--ink-soft)]">收货方</dt><dd>{snapshot.receiverSummary as string}</dd></div>
              </dl>
            )}
          </div>

          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">审批记录</h2>
            {approvals.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">暂无审批记录</p>
            ) : (
              <div className="space-y-3">
                {approvals.map((a) => (
                  <div key={a.id as string} className="rounded-lg border border-[var(--line)] p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{a.action as string} (L{a.level as number})</span>
                      <span className="text-[var(--ink-soft)]">{new Date(a.createdAt as string).toLocaleString("zh-CN")}</span>
                    </div>
                    {!!a.comment && <p className="mt-1 text-[var(--ink-soft)]">{a.comment as string}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">状态变更历史</h2>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id as string} className="flex gap-3 text-sm">
                  <span className="whitespace-nowrap text-[var(--ink-soft)]">
                    {new Date(h.createdAt as string).toLocaleString("zh-CN")}
                  </span>
                  <span>{h.fromStatus as string || "—"} → {TICKET_STATUS_LABELS[h.toStatus as string] || h.toStatus as string}</span>
                  <span className="text-[var(--ink-soft)]">{h.reason as string}</span>
                </div>
              ))}
            </div>
          </div>

          {compensations.length > 0 && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold">赔付记录</h2>
              {compensations.map((c) => (
                <div key={c.id as string} className="text-sm">
                  ¥{(c.amount as number).toFixed(2)} · {c.direction === "to_customer" ? "赔付客户" : "向供应商追偿"} · {c.status as string}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {aiApproval && (canL1 || canL2) && !isReporter && (
            <AiSuggestionCard
              title={`审批 AI 建议：${aiApproval.suggestionLabel}`}
              reasoning={aiApproval.reasoning}
              confidence={aiApproval.confidence}
              source={aiApproval.source}
              references={aiApproval.referenceRecords}
            />
          )}

          {(ticket.status === "pending" || ticket.status === "level1_review") && canL1 && !isReporter && (
            <div className="card">
              <h3 className="mb-3 font-semibold">一级审批</h3>
              <textarea className="input mb-3 min-h-[80px]" placeholder="审批意见" value={comment} onChange={(e) => setComment(e.target.value)} />
              {confirmAction === "approve_l1" ? (
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" disabled={loading} onClick={() => doAction("approve", { level: 1 })}>确认通过</button>
                  <button className="btn-secondary" onClick={() => setConfirmAction(null)}>取消</button>
                </div>
              ) : confirmAction === "reject_l1" ? (
                <div className="flex gap-2">
                  <button className="btn-danger flex-1" disabled={loading} onClick={() => doAction("reject", { level: 1 })}>确认拒绝</button>
                  <button className="btn-secondary" onClick={() => setConfirmAction(null)}>取消</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={() => setConfirmAction("approve_l1")}>通过</button>
                  <button className="btn-danger flex-1" onClick={() => setConfirmAction("reject_l1")}>拒绝</button>
                </div>
              )}
            </div>
          )}

          {ticket.status === "level2_review" && canL2 && !isReporter && (
            <div className="card">
              <h3 className="mb-3 font-semibold">二级审批</h3>
              <textarea className="input mb-3 min-h-[80px]" placeholder="审批意见" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={loading} onClick={() => doAction("approve", { level: 2 })}>通过</button>
                <button className="btn-danger flex-1" disabled={loading} onClick={() => doAction("reject", { level: 2 })}>拒绝</button>
              </div>
            </div>
          )}

          {ticket.category === "qc" && !["completed", "rejected_closed"].includes(ticket.status as string) && canQC && (
            <div className="card">
              <h3 className="mb-3 font-semibold">误判快速放行</h3>
              <textarea className="input mb-3 min-h-[80px]" placeholder="复核原因（必填）" value={fastReason} onChange={(e) => setFastReason(e.target.value)} />
              <button
                className="btn-secondary w-full"
                disabled={loading || !fastReason.trim()}
                onClick={() => doAction("fast_release", { reason: fastReason })}
              >
                快速放行
              </button>
            </div>
          )}

          {isReporter && ["pending", "level1_review", "level2_review"].includes(ticket.status as string) && (
            <div className="card text-sm text-amber-700">您是此工单的上报人，不能审批自己提交的工单</div>
          )}
        </div>
      </div>
    </div>
  );
}
