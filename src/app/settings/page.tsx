"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "@/lib/constants";

type SettingsData = {
  configs: Array<{ key: string; value: string; description: string }>;
  approvalRules: Array<Record<string, unknown>>;
  qcRules: Array<Record<string, unknown>>;
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          setError(
            r.status === 403
              ? "仅系统管理员可查看规则配置，请在右上角切换为「系统管理员」角色"
              : (body.error as string) || "加载失败"
          );
          return;
        }
        setData(body);
      })
      .catch(() => setError("网络错误，请稍后重试"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>加载中...</div>;

  if (error) {
    return (
      <div>
        <h1 className="page-title mb-4">规则配置</h1>
        <div className="card text-[var(--ink-soft)]">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h1 className="page-title mb-4">规则配置</h1>

      <div className="card mb-6">
        <h2 className="mb-4 text-lg font-semibold">系统参数（可配置，非硬编码）</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>参数</th><th>当前值</th><th>说明</th></tr></thead>
            <tbody>
              {Object.entries(DEFAULT_CONFIG).map(([key, defaultVal]) => {
                const cfg = data.configs.find((c) => c.key === key);
                return (
                  <tr key={key}>
                    <td className="font-mono text-xs">{key}</td>
                    <td className="font-bold text-[var(--accent-dark)]">{cfg?.value || defaultVal}</td>
                    <td>{cfg?.description || key}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="mb-4 text-lg font-semibold">分级审批规则</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>规则名</th><th>金额范围</th><th>审批层级</th><th>状态</th></tr></thead>
            <tbody>
              {data.approvalRules.map((r) => (
                <tr key={r.id as string}>
                  <td>{r.name as string}</td>
                  <td>¥{r.minAmount as number} — {r.maxAmount ? `¥${r.maxAmount}` : "无上限"}</td>
                  <td>{r.requiredLevel as number} 级</td>
                  <td>{r.enabled ? "启用" : "禁用"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">品控规则引擎</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>规则名</th><th>子类型</th><th>条件</th><th>阈值</th><th>严重度</th><th>状态</th></tr></thead>
            <tbody>
              {data.qcRules.map((r) => (
                <tr key={r.id as string}>
                  <td>{r.name as string}</td>
                  <td>{r.subType as string}</td>
                  <td>{r.conditionType as string}</td>
                  <td>{r.threshold as number}</td>
                  <td>{r.severity as string}</td>
                  <td>{r.enabled ? "启用" : "禁用"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
