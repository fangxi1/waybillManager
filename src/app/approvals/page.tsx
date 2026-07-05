"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TICKET_STATUS_LABELS, LOGISTICS_TYPE_LABELS, QC_TYPE_LABELS } from "@/lib/constants";

export default function ApprovalsPage() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(async (session) => {
        setUser(session.currentUser);
        const statuses =
          session.currentUser?.role === "approver_l2"
            ? ["level2_review"]
            : ["pending", "level1_review"];
        const results = await Promise.all(
          statuses.map((s) => fetch(`/api/tickets?status=${s}&pageSize=50`).then((r) => r.json()))
        );
        const all = results.flatMap((r) => r.data || []);
        const filtered = all.filter(
          (t: Record<string, unknown>) => t.reporterId !== session.currentUser?.id
        );
        setTickets(filtered);
      });
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">待我审批</h1>
      {!user ? (
        <p>请先登录</p>
      ) : tickets.length === 0 ? (
        <div className="card text-center text-[var(--ink-soft)]">暂无待审批工单</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>运单号</th>
                <th>类型</th>
                <th>状态</th>
                <th>金额</th>
                <th>截止时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id as string}>
                  <td>{t.waybillNo as string}</td>
                  <td>
                    {t.category === "qc"
                      ? QC_TYPE_LABELS[t.type as string]
                      : LOGISTICS_TYPE_LABELS[t.type as string]}
                  </td>
                  <td>{TICKET_STATUS_LABELS[t.status as string]}</td>
                  <td>¥{(t.amount as number).toFixed(2)}</td>
                  <td>
                    {t.deadlineAt ? new Date(t.deadlineAt as string).toLocaleString("zh-CN") : "—"}
                    {!!t.nearDeadline && <span className="badge badge-warning ml-1">即将超时</span>}
                  </td>
                  <td>
                    <Link href={`/tickets/${t.id}`} className="text-[var(--accent-dark)] hover:underline">
                      审批
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
