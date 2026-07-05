"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@/lib/constants";

interface User {
  id: string;
  name: string;
  role: string;
}

const NAV = [
  { href: "/", label: "工作台" },
  { href: "/tickets", label: "工单列表" },
  { href: "/tickets/new", label: "异常上报" },
  { href: "/scan", label: "扫描品控" },
  { href: "/approvals", label: "待我审批" },
  { href: "/sync", label: "接口监控" },
  { href: "/settings", label: "规则配置" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.currentUser);
        setUsers(d.users || []);
      });
  }, []);

  async function switchUser(userId: string) {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const res = await fetch("/api/auth/session");
    const d = await res.json();
    setUser(d.currentUser);
    window.location.reload();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_var(--accent-tint)]" />
            <span className="text-lg font-bold text-[var(--ink)]">运单全流程管理 V3</span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-[var(--ink-soft)]">
                {user.name} · {ROLE_LABELS[user.role] || user.role}
              </span>
            )}
            <select
              className="input w-auto text-xs"
              value={user?.id || ""}
              onChange={(e) => switchUser(e.target.value)}
            >
              <option value="">切换角色</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLE_LABELS[u.role]})
                </option>
              ))}
            </select>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-[var(--accent-tint)] font-medium text-[var(--accent-dark)]"
                  : "text-[var(--ink-soft)] hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
