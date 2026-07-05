import { NextRequest, NextResponse } from "next/server";
import { and, desc, like, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const waybillNo = searchParams.get("waybillNo")?.trim() || "";
  const warehouseId = searchParams.get("warehouseId")?.trim() || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));

  const db = getDb();
  const conditions = [];
  if (waybillNo) conditions.push(like(schema.waybillSnapshots.waybillNo, `%${waybillNo}%`));
  if (warehouseId) conditions.push(like(schema.waybillSnapshots.warehouseId, `%${warehouseId}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.waybillSnapshots.findMany({
      where,
      orderBy: [desc(schema.waybillSnapshots.syncedAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.waybillSnapshots)
      .where(where),
  ]);

  const data = items.map((snap) => {
    let skus: Array<{ sku: string; name: string; quantity: number; batchId: string }> = [];
    try {
      skus = JSON.parse(snap.skuList);
    } catch {
      skus = [];
    }
    return {
      waybillNo: snap.waybillNo,
      senderSummary: snap.senderSummary,
      receiverSummary: snap.receiverSummary,
      amount: snap.amount,
      warehouseId: snap.warehouseId,
      status: snap.status,
      skuCount: skus.length,
      skus,
      syncedAt: snap.syncedAt,
      dataSource: snap.dataSource,
    };
  });

  return NextResponse.json({
    data,
    total: countResult[0]?.count || 0,
    page,
    pageSize,
  });
}
