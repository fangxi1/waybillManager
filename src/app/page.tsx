"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  total: number;
  pending: number;
  review: number;
  completed: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, review: 0, completed: 0 });
  const [syncInfo, setSyncInfo] = useState<{ lastSyncAt: string | null; successRate: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tickets?pageSize=1").then((r) => r.json()),
      fetch("/api/tickets?status=pending&pageSize=1").then((r) => r.json()),
      fetch("/api/tickets?status=level1_review&pageSize=1").then((r) => r.json()),
      fetch("/api/tickets?status=completed&pageSize=1").then((r) => r.json()),
      fetch("/api/sync").then((r) => r.json()),
    ]).then(([all, pending, l1, completed, sync]) => {
      setStats({
        total: all.total || 0,
        pending: pending.total || 0,
        review: l1.total || 0,
        completed: completed.total || 0,
      });
      setSyncInfo(sync);
    });
  }, []);

  const cards = [
    { label: "工单总数", value: stats.total, color: "text-[var(--accent-dark)]" },
    { label: "待审批", value: stats.pending, color: "text-amber-600" },
    { label: "审批中", value: stats.review, color: "text-blue-600" },
    { label: "已完成", value: stats.completed, color: "text-green-600" },
  ];

  return (
    <div>
      <h1 className="page-title">工作台</h1>
      <p className="mb-8 text-[var(--ink-soft)]">
        运单全生命周期管理 — 录单 → 扫描品控 → 异常上报 → 分级审批 → 执行联动
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card text-center">
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="mt-1 text-sm text-[var(--ink-soft)]">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">快捷操作</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/scan" className="btn-primary">扫描品控</Link>
            <Link href="/tickets/new" className="btn-secondary">异常上报</Link>
            <Link href="/approvals" className="btn-secondary">待我审批</Link>
            <Link href="/tickets" className="btn-secondary">工单列表</Link>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">V2 接口状态</h2>
          {syncInfo ? (
            <div className="space-y-2 text-sm text-[var(--ink-soft)]">
              <p>最近同步: {syncInfo.lastSyncAt ? new Date(syncInfo.lastSyncAt).toLocaleString("zh-CN") : "暂无"}</p>
              <p>成功率: {syncInfo.successRate}%</p>
              <Link href="/sync" className="text-[var(--accent-dark)] hover:underline">查看接口监控 →</Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">加载中...</p>
          )}
        </div>
      </div>
    </div>
  );
}
