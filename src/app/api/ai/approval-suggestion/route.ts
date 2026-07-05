import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser, canApproveLevel1, canApproveLevel2 } from "@/lib/auth";
import { suggestApproval } from "@/lib/ai-service";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (!canApproveLevel1(user) && !canApproveLevel2(user))) {
    return NextResponse.json({ error: "无审批权限" }, { status: 403 });
  }

  const ticketId = new URL(req.url).searchParams.get("ticketId");
  if (!ticketId) return NextResponse.json({ error: "缺少 ticketId" }, { status: 400 });

  const db = getDb();
  const ticket = await db.query.exceptionTickets.findFirst({
    where: eq(schema.exceptionTickets.id, ticketId),
  });
  if (!ticket) return NextResponse.json({ error: "工单不存在" }, { status: 404 });

  const historyApprovals = await db.query.approvalRecords.findMany({
    orderBy: [desc(schema.approvalRecords.createdAt)],
    limit: 50,
  });

  const ticketIds = [...new Set(historyApprovals.map((a) => a.ticketId))];
  const relatedTickets =
    ticketIds.length > 0
      ? await db.query.exceptionTickets.findMany()
      : [];

  const historyRecords = historyApprovals
    .map((a) => {
      const t = relatedTickets.find((rt) => rt.id === a.ticketId);
      return t
        ? {
            ticketId: a.ticketId,
            type: t.type,
            action: a.action,
            comment: a.comment,
            amount: t.amount,
          }
        : null;
    })
    .filter(Boolean) as Array<{
    ticketId: string;
    type: string;
    action: string;
    comment: string | null;
    amount: number;
  }>;

  const suggestion = await suggestApproval({
    type: ticket.type,
    category: ticket.category,
    amount: ticket.amount,
    description: ticket.description,
    historyRecords,
  });

  return NextResponse.json(suggestion);
}
