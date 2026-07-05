import { NextRequest, NextResponse } from "next/server";
import { syncWaybillList } from "@/lib/v2-client";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncWaybillList({ pageSize: 50 });
  return NextResponse.json({
    synced: result.data?.length || 0,
    source: result.source,
    syncedAt: result.syncedAt,
    warning: result.error,
    at: new Date().toISOString(),
  });
}
