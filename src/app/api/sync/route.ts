import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { syncWaybillList } from "@/lib/v2-client";

export const maxDuration = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const db = getDb();

  const [logs, stats, lastSync] = await Promise.all([
    db.query.apiSyncLogs.findMany({
      orderBy: [desc(schema.apiSyncLogs.createdAt)],
      limit: 50,
    }),
    db
      .select({
        total: sql<number>`count(*)`,
        success: sql<number>`sum(case when ${schema.apiSyncLogs.success} = 1 then 1 else 0 end)`,
      })
      .from(schema.apiSyncLogs),
    db.query.waybillSnapshots.findFirst({
      orderBy: [desc(schema.waybillSnapshots.syncedAt)],
    }),
  ]);

  const total = stats[0]?.total || 0;
  const success = stats[0]?.success || 0;

  return NextResponse.json({
    lastSyncAt: lastSync?.syncedAt || null,
    successRate: total > 0 ? ((success / total) * 100).toFixed(1) : "N/A",
    totalCalls: total,
    logs,
  });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const result = await syncWaybillList({ pageSize: 30 });
  return NextResponse.json({
    synced: result.data?.length || 0,
    source: result.source,
    syncedAt: result.syncedAt,
    warning: result.error,
  });
}
