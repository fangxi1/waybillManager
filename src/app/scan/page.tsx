"use client";

import { useState } from "react";

export default function ScanPage() {
  const [form, setForm] = useState({
    waybillNo: "",
    sku: "",
    batchId: "",
    expectedQuantity: 10,
    actualQuantity: 8,
    damageLevel: 0,
    specDeviation: 0,
    labelMismatch: false,
    batchInvalid: false,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-2xl font-bold">扫描品控</h1>
      <p className="mb-6 text-sm text-[var(--ink-soft)]">
        模拟扫描枪录入，通过 V2 接口校验 SKU 归属，品控规则引擎自动判定
      </p>

      <div className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">运单号</label>
          <input
            className="input"
            placeholder="V2 外部编码，如 PS2605290033"
            value={form.waybillNo}
            onChange={(e) => setForm({ ...form, waybillNo: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">SKU</label>
            <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">批次号</label>
            <input className="input" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">预期数量</label>
            <input className="input" type="number" value={form.expectedQuantity} onChange={(e) => setForm({ ...form, expectedQuantity: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">实际数量</label>
            <input className="input" type="number" value={form.actualQuantity} onChange={(e) => setForm({ ...form, actualQuantity: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">破损等级 (0-5)</label>
            <input className="input" type="number" min={0} max={5} value={form.damageLevel} onChange={(e) => setForm({ ...form, damageLevel: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">规格偏差 %</label>
            <input className="input" type="number" value={form.specDeviation} onChange={(e) => setForm({ ...form, specDeviation: Number(e.target.value) })} />
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.labelMismatch} onChange={(e) => setForm({ ...form, labelMismatch: e.target.checked })} />
            标签错误
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.batchInvalid} onChange={(e) => setForm({ ...form, batchInvalid: e.target.checked })} />
            批次异常
          </label>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.pass ? "bg-green-50 text-green-700" : result.duplicate ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
            <p>{result.message as string}</p>
            {!!result.hitRule && <p>命中规则: {result.hitRule as string}</p>}
            {!!result.ticketId && <p>工单: {result.ticketId as string}</p>}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading} onClick={submit}>
          {loading ? "扫描检测中..." : "提交扫描"}
        </button>
      </div>

      <div className="card mt-6 text-sm text-[var(--ink-soft)]">
        <h3 className="mb-2 font-semibold text-[var(--ink)]">测试提示</h3>
        <ul className="list-inside list-disc space-y-1">
          <li>运单号 = V2 的 <code>externalCode</code>（外部编码/配送单号）</li>
          <li>SKU = V2 的 <code>skuCode</code>（SKU物品编码）</li>
          <li>请先在 V2 系统导入订单，再在 V3 扫描</li>
          <li>实际数量与预期差异过大 → 触发品控规则</li>
        </ul>
      </div>
    </div>
  );
}
