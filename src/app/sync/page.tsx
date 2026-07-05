"use client";

import { useCallback, useEffect, useState } from "react";

interface SyncLog {
  id: string;
  requestId: string;
  apiName: string;
  requestSummary: string;
  responseStatus: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export default function SyncPage() {
  const [info, setInfo] = useState<{
    lastSyncAt: string | null;
    successRate: string;
    totalCalls: number;
    logs: SyncLog[];
  } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/sync");
    setInfo(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function triggerSync() {
    setSyncing(true);
    await fetch("/api/sync", { method: "POST" });
    await load();
    setSyncing(false);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">V2 接口监控</h1>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-[var(--accent-dark)]">
            {info?.lastSyncAt ? new Date(info.lastSyncAt).toLocaleString("zh-CN") : "暂无"}
          </div>
          <div className="text-sm text-[var(--ink-soft)]">最近同步时间</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-600">{info?.successRate || "—"}%</div>
          <div className="text-sm text-[var(--ink-soft)]">调用成功率</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold">{info?.totalCalls || 0}</div>
          <div className="text-sm text-[var(--ink-soft)]">总调用次数</div>
        </div>
      </div>

      <button className="btn-primary mb-6" disabled={syncing} onClick={triggerSync}>
        {syncing ? "同步中..." : "手动触发运单同步"}
      </button>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>时间</th>
              <th>Request ID</th>
              <th>接口</th>
              <th>入参</th>
              <th>状态码</th>
              <th>耗时</th>
              <th>结果</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            {(info?.logs || []).map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                <td className="font-mono text-xs">{log.requestId}</td>
                <td>{log.apiName}</td>
                <td className="max-w-[200px] truncate">{log.requestSummary}</td>
                <td>{log.responseStatus || "—"}</td>
                <td>{log.durationMs}ms</td>
                <td>{log.success ? "✅" : "❌"}</td>
                <td className="max-w-[200px] truncate text-red-600">{log.errorMessage || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
