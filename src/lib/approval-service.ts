import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ExceptionTicket, User } from "@/db/schema";
import {
  ConflictError,
  getRequiredApprovalLevel,
  recordStatusChange,
  setApprovalDeadline,
  transitionTicket,
} from "./ticket-service";
import { executeApprovedAction } from "./execution-service";
import { newId, nowIso, getConfigNumber } from "./utils";

export async function approveTicket(params: {
  ticket: ExceptionTicket;
  approver: User;
  level: 1 | 2;
  comment: string;
  idempotencyKey?: string;
}) {
  const { ticket, approver, level, comment, idempotencyKey } = params;
  const db = getDb();

  if (ticket.reporterId === approver.id) {
    throw new Error("不能审批自己提交的工单");
  }

  const expectedStatus = level === 1 ? "level1_review" : "level2_review";
  if (ticket.status !== expectedStatus && ticket.status !== "pending" && level === 1) {
    if (ticket.status !== "level1_review") {
      throw new ConflictError("该工单已被处理，请刷新后重试");
    }
  }
  if (level === 2 && ticket.status !== "level2_review") {
    throw new ConflictError("该工单已被处理，请刷新后重试");
  }

  if (idempotencyKey) {
    const existing = await db.query.approvalRecords.findFirst({
      where: eq(schema.approvalRecords.idempotencyKey, idempotencyKey),
    });
    if (existing) return { ticket, approvalId: existing.id, duplicate: true };
  }

  const requiredLevel = await getRequiredApprovalLevel(ticket.amount);

  if (level === 1 && requiredLevel === 2) {
    const approvalId = newId();
    await db.insert(schema.approvalRecords).values({
      id: approvalId,
      ticketId: ticket.id,
      approverId: approver.id,
      level: 1,
      action: "approve",
      comment,
      idempotencyKey,
      createdAt: nowIso(),
    });

    const updated = await transitionTicket(
      ticket,
      "level2_review",
      approver.id,
      "一级审批通过，金额超阈值升级二级审批"
    );
    const deadline = await setApprovalDeadline(updated, 2);
    await db
      .update(schema.exceptionTickets)
      .set({ deadlineAt: deadline, assigneeId: null })
      .where(eq(schema.exceptionTickets.id, ticket.id));

    return { ticket: updated, approvalId, escalated: true };
  }

  const approvalId = newId();
  await db.insert(schema.approvalRecords).values({
    id: approvalId,
    ticketId: ticket.id,
    approverId: approver.id,
    level,
    action: "approve",
    comment,
    idempotencyKey,
    createdAt: nowIso(),
  });

  const updated = await transitionTicket(ticket, "executing", approver.id, `${level}级审批通过，开始执行`);
  const result = await executeApprovedAction(updated, approvalId);
  return { ticket: result.ticket, approvalId, executed: true };
}

export async function rejectTicket(params: {
  ticket: ExceptionTicket;
  approver: User;
  level: 1 | 2;
  comment: string;
  idempotencyKey?: string;
}) {
  const { ticket, approver, level, comment, idempotencyKey } = params;
  const db = getDb();

  if (ticket.reporterId === approver.id) {
    throw new Error("不能审批自己提交的工单");
  }

  if (idempotencyKey) {
    const existing = await db.query.approvalRecords.findFirst({
      where: eq(schema.approvalRecords.idempotencyKey, idempotencyKey),
    });
    if (existing) return { ticket, approvalId: existing.id, duplicate: true };
  }

  const maxResubmit = await getConfigNumber("resubmit_max_count");
  const approvalId = newId();

  await db.insert(schema.approvalRecords).values({
    id: approvalId,
    ticketId: ticket.id,
    approverId: approver.id,
    level,
    action: "reject",
    comment,
    idempotencyKey,
    createdAt: nowIso(),
  });

  if (ticket.resubmitCount >= maxResubmit) {
    const updated = await transitionTicket(ticket, "rejected_closed", approver.id, "超过重提次数上限，工单关闭");
    if (ticket.holdStatus === "held") {
      await unlockBatch(ticket.id);
    }
    return { ticket: updated, approvalId, closed: true };
  }

  const updated = await transitionTicket(ticket, "pending", approver.id, "审批拒绝，退回待审批", {
    resubmitCount: ticket.resubmitCount + 1,
    assigneeId: null,
  });
  const deadline = await setApprovalDeadline(updated, 1);
  await db
    .update(schema.exceptionTickets)
    .set({ deadlineAt: deadline })
    .where(eq(schema.exceptionTickets.id, ticket.id));

  return { ticket: updated, approvalId, resubmitted: true };
}

export async function fastReleaseTicket(params: {
  ticket: ExceptionTicket;
  supervisor: User;
  reason: string;
}) {
  const { ticket, supervisor, reason } = params;
  const db = getDb();

  if (ticket.category !== "qc") {
    throw new Error("仅品控工单支持快速放行");
  }

  const approvalId = newId();
  await db.insert(schema.approvalRecords).values({
    id: approvalId,
    ticketId: ticket.id,
    approverId: supervisor.id,
    level: 0,
    action: "fast_release",
    comment: reason,
    createdAt: nowIso(),
  });

  await unlockBatch(ticket.id);

  const updated = await transitionTicket(ticket, "completed", supervisor.id, `品控主管误判快速放行: ${reason}`, {
    holdStatus: "fast_released",
    completedAt: nowIso(),
  });

  await db
    .update(schema.scanRecords)
    .set({ batchStatus: "released" })
    .where(eq(schema.scanRecords.ticketId, ticket.id));

  return { ticket: updated, approvalId };
}

async function unlockBatch(ticketId: string) {
  const db = getDb();
  const items = await db.query.inventory.findMany({
    where: eq(schema.inventory.ticketId, ticketId),
  });
  for (const item of items) {
    await db
      .update(schema.inventory)
      .set({ locked: false, lockReason: null, updatedAt: nowIso() })
      .where(eq(schema.inventory.id, item.id));
    await db.insert(schema.inventoryChanges).values({
      id: newId(),
      inventoryId: item.id,
      ticketId,
      approvalRecordId: "fast_release",
      changeType: "unlock",
      quantityDelta: 0,
      reason: "批次解锁",
      createdAt: nowIso(),
    });
  }
  await db
    .update(schema.exceptionTickets)
    .set({ holdStatus: "released" })
    .where(eq(schema.exceptionTickets.id, ticketId));
}
