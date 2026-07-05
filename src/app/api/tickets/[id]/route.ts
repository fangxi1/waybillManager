import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getWaybill } from "@/lib/v2-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const ticket = await db.query.exceptionTickets.findFirst({
    where: eq(schema.exceptionTickets.id, id),
  });
  if (!ticket) return NextResponse.json({ error: "工单不存在" }, { status: 404 });

  const [approvals, history, compensations, scans, inventoryChanges] = await Promise.all([
    db.query.approvalRecords.findMany({
      where: eq(schema.approvalRecords.ticketId, id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    }),
    db.query.ticketStatusHistory.findMany({
      where: eq(schema.ticketStatusHistory.ticketId, id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    }),
    db.query.compensationRecords.findMany({
      where: eq(schema.compensationRecords.ticketId, id),
    }),
    db.query.scanRecords.findMany({
      where: eq(schema.scanRecords.ticketId, id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    }),
    db.query.inventoryChanges.findMany({
      where: eq(schema.inventoryChanges.ticketId, id),
    }),
  ]);

  const waybillLive = await getWaybill(ticket.waybillNo, true);
  const snapshot = await db.query.waybillSnapshots.findFirst({
    where: eq(schema.waybillSnapshots.waybillNo, ticket.waybillNo),
  });

  const reporter = await db.query.users.findFirst({
    where: eq(schema.users.id, ticket.reporterId),
  });

  return NextResponse.json({
    ticket,
    reporter,
    approvals,
    history,
    compensations,
    scans,
    inventoryChanges,
    waybill: {
      data: waybillLive.data || (snapshot ? JSON.parse(snapshot.skuList) : null),
      source: waybillLive.source,
      syncedAt: waybillLive.syncedAt,
      warning: waybillLive.error,
      snapshot: snapshot
        ? {
            senderSummary: snapshot.senderSummary,
            receiverSummary: snapshot.receiverSummary,
            amount: snapshot.amount,
            syncedAt: snapshot.syncedAt,
            dataSource: snapshot.dataSource,
          }
        : null,
    },
  });
}
