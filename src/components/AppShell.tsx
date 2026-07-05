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

const NAV: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: "/", label: "工作台" },
  { href: "/tickets", label: "工单列表" },
  { href: "/tickets/new", label: "异常上报" },
  { href: "/scan", label: "扫描品控" },
  { href: "/approvals", label: "待我审批" },
  { href: "/sync", label: "接口监控" },
  { href: "/waybills", label: "运单快照" },
  { href: "/settings", label: "规则配置", adminOnly: true },
];

function isNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

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

  const visibleNav = NAV.filter((item) => !item.adminOnly || user?.role === "admin");

  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶栏：与 V2 一致的青色实心导航栏 */}
      <header className="v2-topbar sticky top-0 z-50">
        <div className="flex h-14 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none text-white/90" aria-hidden>
              🐋
            </span>
            <span className="text-lg font-semibold tracking-wide text-white">
              运单全流程管理 V3
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden text-sm text-white/85 sm:inline">
                {user.name} · {ROLE_LABELS[user.role] || user.role}
              </span>
            )}
            <select
              className="v2-topbar-select"
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
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* 左侧深色侧栏：对齐 V2 万能导入模块导航 */}
        <aside className="v2-sidebar hidden w-52 shrink-0 md:block">
          <p className="px-4 py-4 text-xs tracking-wide text-white/45">异常工单模块</p>
          <nav className="space-y-0.5 px-2 pb-6">
            {visibleNav.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-[var(--accent)] font-medium text-white"
                      : "text-white/75 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* 移动端横向导航 */}
        <div className="v2-mobile-nav shrink-0 md:hidden">
          <nav className="flex gap-1 overflow-x-auto px-3 py-2">
            {visibleNav.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--ink-soft)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="v2-main flex-1 px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
