"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";

interface WaybillSnapshot {
  waybillNo: string;
  senderSummary: string;
  receiverSummary: string;
  amount: number;
  warehouseId: string | null;
  status: string;
  skuCount: number;
  skus: Array<{ sku: string; name: string; quantity: number; batchId: string }>;
  syncedAt: string;
  dataSource: "live" | "cache";
}

export default function WaybillsPage() {
  const [items, setItems] = useState<WaybillSnapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ waybillNo: "", warehouseId: "" });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (filters.waybillNo) qs.set("waybillNo", filters.waybillNo);
    if (filters.warehouseId) qs.set("warehouseId", filters.warehouseId);

    const res = await fetch(`/api/waybills?${qs}`);
    const data = await res.json();
    setItems(data.data || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">运单快照</h1>
      <p className="mb-6 text-sm text-[var(--ink-soft)]">
        V3 本地只读缓存，数据来自 V2 集成接口；运单状态以 V2 为准，不可在本表直接修改。
        可在{" "}
        <Link href="/sync" className="text-[var(--accent-dark)] hover:underline">
          接口监控
        </Link>{" "}
        手动触发同步。
      </p>

      <div className="card mb-6 flex flex-wrap gap-3">
        <input
          className="input w-48"
          placeholder="运单号搜索（V2 externalCode）"
          value={filters.waybillNo}
          onChange={(e) => setFilters({ ...filters, waybillNo: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
        />
        <input
          className="input w-48"
          placeholder="门店/仓库筛选"
          value={filters.warehouseId}
          onChange={(e) => setFilters({ ...filters, warehouseId: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
        />
        <button className="btn-primary" onClick={() => { setPage(1); load(); }}>
          筛选
        </button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>运单号</th>
              <th>发货方</th>
              <th>收货方</th>
              <th>门店</th>
              <th>金额</th>
              <th>SKU数</th>
              <th>V2状态</th>
              <th>同步时间</th>
              <th>来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center">
                  加载中...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center">
                  暂无快照数据，请先在{" "}
                  <Link href="/sync" className="text-[var(--accent-dark)] hover:underline">
                    接口监控
                  </Link>{" "}
                  触发运单同步
                </td>
              </tr>
            ) : (
              items.map((wb) => (
                <Fragment key={wb.waybillNo}>
                  <tr>
                    <td className="font-medium text-[var(--ink)]">{wb.waybillNo}</td>
                    <td className="max-w-[140px] truncate">{wb.senderSummary}</td>
                    <td className="max-w-[140px] truncate">{wb.receiverSummary}</td>
                    <td>{wb.warehouseId || "—"}</td>
                    <td>¥{wb.amount.toFixed(2)}</td>
                    <td>{wb.skuCount}</td>
                    <td>{wb.status}</td>
                    <td className="whitespace-nowrap">
                      {new Date(wb.syncedAt).toLocaleString("zh-CN")}
                    </td>
                    <td>
                      <span
                        className={`badge ${wb.dataSource === "live" ? "badge-completed" : "badge-warning"}`}
                      >
                        {wb.dataSource === "live" ? "V2实时" : "本地缓存"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-[var(--accent-dark)] hover:underline"
                        onClick={() =>
                          setExpanded(expanded === wb.waybillNo ? null : wb.waybillNo)
                        }
                      >
                        {expanded === wb.waybillNo ? "收起" : "SKU明细"}
                      </button>
                    </td>
                  </tr>
                  {expanded === wb.waybillNo && (
                    <tr>
                      <td colSpan={10} className="bg-[var(--accent-tint)]">
                        <div className="text-sm">
                          <div className="mb-2 font-medium text-[var(--ink)]">SKU 明细</div>
                          {wb.skus.length === 0 ? (
                            <span className="text-[var(--ink-soft)]">无 SKU 数据</span>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[var(--ink-soft)]">
                                  <th className="pb-1 pr-4">SKU</th>
                                  <th className="pb-1 pr-4">名称</th>
                                  <th className="pb-1 pr-4">数量</th>
                                  <th className="pb-1">批次</th>
                                </tr>
                              </thead>
                              <tbody>
                                {wb.skus.map((s) => (
                                  <tr key={`${wb.waybillNo}-${s.sku}-${s.batchId}`}>
                                    <td className="py-1 pr-4 font-mono">{s.sku}</td>
                                    <td className="py-1 pr-4">{s.name}</td>
                                    <td className="py-1 pr-4">{s.quantity}</td>
                                    <td className="py-1">{s.batchId}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--ink-soft)]">
        <span>共 {total} 条快照</span>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </button>
          <span className="px-3 py-2">第 {page} 页</span>
          <button
            className="btn-secondary"
            disabled={page * 20 >= total}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
