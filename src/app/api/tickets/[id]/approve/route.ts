import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  getCurrentUser,
  canApproveLevel1,
  canApproveLevel2,
  canFastRelease,
} from "@/lib/auth";
import { approveTicket, rejectTicket, fastReleaseTicket } from "@/lib/approval-service";
import { ConflictError } from "@/lib/ticket-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const ticket = await db.query.exceptionTickets.findFirst({
      where: eq(schema.exceptionTickets.id, id),
    });
    if (!ticket) return NextResponse.json({ error: "工单不存在" }, { status: 404 });

    const idempotencyKey = body.idempotencyKey || `${user.id}_${body.action}_${Date.now()}`;

    if (body.action === "approve") {
      const level = body.level as 1 | 2;
      if (level === 1 && !canApproveLevel1(user)) {
        return NextResponse.json({ error: "无一级审批权限" }, { status: 403 });
      }
      if (level === 2 && !canApproveLevel2(user)) {
        return NextResponse.json({ error: "无二级审批权限" }, { status: 403 });
      }
      const result = await approveTicket({
        ticket,
        approver: user,
        level,
        comment: body.comment || "",
        idempotencyKey,
      });
      return NextResponse.json(result);
    }

    if (body.action === "reject") {
      const level = body.level as 1 | 2;
      if (level === 1 && !canApproveLevel1(user)) {
        return NextResponse.json({ error: "无一级审批权限" }, { status: 403 });
      }
      if (level === 2 && !canApproveLevel2(user)) {
        return NextResponse.json({ error: "无二级审批权限" }, { status: 403 });
      }
      const result = await rejectTicket({
        ticket,
        approver: user,
        level,
        comment: body.comment || "",
        idempotencyKey,
      });
      return NextResponse.json(result);
    }

    if (body.action === "fast_release") {
      if (!canFastRelease(user)) {
        return NextResponse.json({ error: "仅品控主管可执行快速放行" }, { status: 403 });
      }
      if (!body.reason?.trim()) {
        return NextResponse.json({ error: "请填写复核原因" }, { status: 400 });
      }
      const result = await fastReleaseTicket({
        ticket,
        supervisor: user,
        reason: body.reason,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "操作失败";
    const status = msg.includes("不能审批") || msg.includes("无权限") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
