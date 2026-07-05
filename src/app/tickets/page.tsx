"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  TICKET_STATUS_LABELS,
  LOGISTICS_TYPE_LABELS,
  QC_TYPE_LABELS,
} from "@/lib/constants";

interface Ticket {
  id: string;
  waybillNo: string;
  category: string;
  type: string;
  source: string;
  status: string;
  amount: number;
  reporterName: string;
  createdAt: string;
  deadlineAt: string | null;
  nearDeadline: boolean;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "badge-pending",
    level1_review: "badge-review",
    level2_review: "badge-review",
    executing: "badge-executing",
    completed: "badge-completed",
    rejected_closed: "badge-closed",
  };
  return map[status] || "badge-closed";
}

function typeLabel(category: string, type: string) {
  return category === "qc"
    ? QC_TYPE_LABELS[type] || type
    : LOGISTICS_TYPE_LABELS[type] || type;
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", category: "", waybillNo: "", assigneeId: "" });
  const [approvers, setApprovers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users || []).filter((u: { role: string }) =>
          ["approver_l1", "approver_l2"].includes(u.role)
        );
        setApprovers(list);
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (filters.status) qs.set("status", filters.status);
    if (filters.category) qs.set("category", filters.category);
    if (filters.waybillNo) qs.set("waybillNo", filters.waybillNo);
    if (filters.assigneeId) qs.set("assigneeId", filters.assigneeId);

    const res = await fetch(`/api/tickets?${qs}`);
    const data = await res.json();
    setTickets(data.data || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">工单列表</h1>

      <div className="card mb-6 flex flex-wrap gap-3">
        <select
          className="input w-auto"
          value={filters.status}
          onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
        >
          <option value="">全部状态</option>
          {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filters.category}
          onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }}
        >
          <option value="">全部类型</option>
          <option value="logistics">物流异常</option>
          <option value="qc">品控异常</option>
        </select>
        <input
          className="input w-48"
          placeholder="运单号搜索"
          value={filters.waybillNo}
          onChange={(e) => setFilters({ ...filters, waybillNo: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
        />
        <select
          className="input w-auto"
          value={filters.assigneeId}
          onChange={(e) => { setFilters({ ...filters, assigneeId: e.target.value }); setPage(1); }}
        >
          <option value="">全部审批人</option>
          {approvers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role === "approver_l1" ? "一级" : "二级"})
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={() => { setPage(1); load(); }}>筛选</button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>工单ID</th>
              <th>运单号</th>
              <th>类别</th>
              <th>异常类型</th>
              <th>来源</th>
              <th>状态</th>
              <th>金额</th>
              <th>上报人</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-8">加载中...</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-8">暂无数据</td></tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">{t.id.slice(0, 8)}...</td>
                  <td>{t.waybillNo}</td>
                  <td>
                    <span className={`badge ${t.category === "qc" ? "badge-qc" : "badge-logistics"}`}>
                      {t.category === "qc" ? "品控" : "物流"}
                    </span>
                  </td>
                  <td>{typeLabel(t.category, t.type)}</td>
                  <td>{t.source === "scan" ? "扫描触发" : "手工上报"}</td>
                  <td>
                    <span className={`badge ${statusBadge(t.status)}`}>
                      {TICKET_STATUS_LABELS[t.status] || t.status}
                    </span>
                    {!!t.nearDeadline && <span className="badge badge-warning ml-1">即将超时</span>}
                  </td>
                  <td>¥{t.amount.toFixed(2)}</td>
                  <td>{t.reporterName}</td>
                  <td>{new Date(t.createdAt).toLocaleString("zh-CN")}</td>
                  <td>
                    <Link href={`/tickets/${t.id}`} className="text-[var(--accent-dark)] hover:underline">
                      详情
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--ink-soft)]">
        <span>共 {total} 条</span>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
          <span className="px-3 py-2">第 {page} 页</span>
          <button className="btn-secondary" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      </div>
    </div>
  );
}
