import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, like, sql, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser, canReport } from "@/lib/auth";
import { reportLogisticsException } from "@/lib/scan-service";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const type = searchParams.get("type");
  const waybillNo = searchParams.get("waybillNo");
  const assigneeId = searchParams.get("assigneeId");
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("pageSize") || 20);

  const db = getDb();
  const conditions = [];

  if (status) conditions.push(eq(schema.exceptionTickets.status, status as never));
  if (category) conditions.push(eq(schema.exceptionTickets.category, category as never));
  if (type) conditions.push(eq(schema.exceptionTickets.type, type));
  if (waybillNo) conditions.push(like(schema.exceptionTickets.waybillNo, `%${waybillNo}%`));
  if (assigneeId) conditions.push(eq(schema.exceptionTickets.assigneeId, assigneeId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.exceptionTickets.findMany({
      where,
      orderBy: [desc(schema.exceptionTickets.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    db.select({ count: sql<number>`count(*)` }).from(schema.exceptionTickets).where(where),
  ]);

  const reporterIds = [...new Set(items.map((t) => t.reporterId))];
  const reporters =
    reporterIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(schema.users.id, reporterIds),
        })
      : [];

  const enriched = items.map((t) => ({
    ...t,
    reporterName: reporters.find((r) => r.id === t.reporterId)?.name || t.reporterId,
    nearDeadline:
      t.deadlineAt &&
      new Date(t.deadlineAt).getTime() - Date.now() < 4 * 3600_000 &&
      !["completed", "rejected_closed"].includes(t.status),
  }));

  return NextResponse.json({
    data: enriched,
    total: countResult[0]?.count || 0,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canReport(user)) {
      return NextResponse.json({ error: "无权限上报" }, { status: 403 });
    }

    const body = await req.json();
    const result = await reportLogisticsException({
      waybillNo: body.waybillNo,
      type: body.type,
      description: body.description,
      reporter: user,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "上报失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
