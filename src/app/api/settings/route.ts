import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { getCurrentUser, canManageConfig } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageConfig(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const db = getDb();
  const [configs, approvalRules, qcRules] = await Promise.all([
    db.query.systemConfig.findMany(),
    db.query.approvalRules.findMany(),
    db.query.qcRules.findMany(),
  ]);

  return NextResponse.json({ configs, approvalRules, qcRules });
}
