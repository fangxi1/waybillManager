import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ExceptionTicket, User } from "@/db/schema";
import type { DbClient } from "./db-types";
import {
  ConflictError,
  getRequiredApprovalLevel,
  recordStatusChange,
  setApprovalDeadline,
  transitionTicket,
} from "./ticket-service";
import { executeApprovedAction } from "./execution-service";
import { getWaybill } from "./v2-client";
import { newId, nowIso, getConfigNumber } from "./utils";

const AMOUNT_DIFF_LOG_THRESHOLD_PCT = 10;

async function reconcileTicketAmountWithV2(ticket: ExceptionTicket) {
  const waybillResult = await getWaybill(ticket.waybillNo, true);
  if (!waybillResult.data) {
    return { ticket, amountWarning: undefined as string | undefined };
  }

  const liveAmount = waybillResult.data.amount;
  const originalAmount = ticket.amount;
  if (Math.abs(liveAmount - originalAmount) < 0.01) {
    return { ticket, amountWarning: undefined as string | undefined };
  }

  const diffPct =
    originalAmount > 0
      ? (Math.abs(liveAmount - originalAmount) / originalAmount) * 100
      : 100;

  const db = getDb();
  const [updated] = await db
    .update(schema.exceptionTickets)
    .set({ amount: liveAmount, updatedAt: nowIso() })
    .where(eq(schema.exceptionTickets.id, ticket.id))
    .returning();

  const syncedTicket = updated || ticket;
  let amountWarning: string | undefined;

  if (diffPct > AMOUNT_DIFF_LOG_THRESHOLD_PCT) {
    amountWarning = `V2运单金额与工单创建时不一致：创建时 ¥${originalAmount.toFixed(2)}，V2实时 ¥${liveAmount.toFixed(2)}（差异 ${diffPct.toFixed(1)}%），已以 V2 为准更新，建议人工复核`;
    await recordStatusChange(
      ticket.id,
      ticket.status,
      ticket.status,
      null,
      amountWarning
    );
  }

  return { ticket: syncedTicket, amountWarning };
}

async function findIdempotentApproval(idempotencyKey?: string) {
  if (!idempotencyKey) return null;
  const db = getDb();
  return db.query.approvalRecords.findFirst({
    where: eq(schema.approvalRecords.idempotencyKey, idempotencyKey),
  });
}

async function unlockBatch(ticketId: string, approvalRecordId: string, dbClient?: DbClient) {
  const db = dbClient ?? getDb();
  const items = await db.query.inventory.findMany({
    where: eq(schema.inventory.ticketId, ticketId),
  });
  for (const item of items) {
    const existingChange = await db.query.inventoryChanges.findFirst({
      where: and(
        eq(schema.inventoryChanges.approvalRecordId, approvalRecordId),
        eq(schema.inventoryChanges.inventoryId, item.id)
      ),
    });
    if (existingChange) continue;

    await db
      .update(schema.inventory)
      .set({ locked: false, lockReason: null, updatedAt: nowIso() })
      .where(eq(schema.inventory.id, item.id));
    await db.insert(schema.inventoryChanges).values({
      id: newId(),
      inventoryId: item.id,
      ticketId,
      approvalRecordId,
      changeType: "unlock",
      quantityDelta: 0,
      reason: "批次解锁",
      createdAt: nowIso(),
    });
  }
}

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

  if (level === 1 && ticket.status !== "level1_review" && ticket.status !== "pending") {
    throw new ConflictError("该工单已被处理，请刷新后重试");
  }
  if (level === 2 && ticket.status !== "level2_review") {
    throw new ConflictError("该工单已被处理，请刷新后重试");
  }

  const existing = await findIdempotentApproval(idempotencyKey);
  if (existing) return { ticket, approvalId: existing.id, duplicate: true };

  const { ticket: syncedTicket, amountWarning } = await reconcileTicketAmountWithV2(ticket);
  const approvalComment = amountWarning ? `${comment}\n[系统] ${amountWarning}` : comment;

  const requiredLevel = await getRequiredApprovalLevel(syncedTicket.amount);

  if (level === 1 && requiredLevel === 2) {
    const approvalId = newId();
    const updated = await db.transaction(async (tx) => {
      await tx.insert(schema.approvalRecords).values({
        id: approvalId,
        ticketId: syncedTicket.id,
        approverId: approver.id,
        level: 1,
        action: "approve",
        comment: approvalComment,
        idempotencyKey,
        createdAt: nowIso(),
      });

      const transitioned = await transitionTicket(
        syncedTicket,
        "level2_review",
        approver.id,
        amountWarning
          ? "一级审批通过，金额超阈值升级二级审批（审批前已同步 V2 金额）"
          : "一级审批通过，金额超阈值升级二级审批",
        undefined,
        tx
      );
      const deadline = await setApprovalDeadline(transitioned, 2);
      await tx
        .update(schema.exceptionTickets)
        .set({ deadlineAt: deadline, assigneeId: null })
        .where(eq(schema.exceptionTickets.id, syncedTicket.id));
      return transitioned;
    });

    return { ticket: updated, approvalId, escalated: true, amountWarning };
  }

  const approvalId = newId();
  const result = await db.transaction(async (tx) => {
    await tx.insert(schema.approvalRecords).values({
      id: approvalId,
      ticketId: syncedTicket.id,
      approverId: approver.id,
      level,
      action: "approve",
      comment: approvalComment,
      idempotencyKey,
      createdAt: nowIso(),
    });

    const updated = await transitionTicket(
      syncedTicket,
      "executing",
      approver.id,
      `${level}级审批通过，开始执行`,
      undefined,
      tx
    );
    return executeApprovedAction(updated, approvalId, tx);
  });

  return { ticket: result.ticket, approvalId, executed: true, amountWarning };
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

  const existing = await findIdempotentApproval(idempotencyKey);
  if (existing) return { ticket, approvalId: existing.id, duplicate: true };

  const maxResubmit = await getConfigNumber("resubmit_max_count");
  const approvalId = newId();

  if (ticket.resubmitCount >= maxResubmit) {
    const updated = await db.transaction(async (tx) => {
      await tx.insert(schema.approvalRecords).values({
        id: approvalId,
        ticketId: ticket.id,
        approverId: approver.id,
        level,
        action: "reject",
        comment,
        idempotencyKey,
        createdAt: nowIso(),
      });

      const closed = await transitionTicket(
        ticket,
        "rejected_closed",
        approver.id,
        "超过重提次数上限，工单关闭",
        undefined,
        tx
      );
      if (ticket.holdStatus === "held") {
        await unlockBatch(ticket.id, approvalId, tx);
        await tx
          .update(schema.exceptionTickets)
          .set({ holdStatus: "released" })
          .where(eq(schema.exceptionTickets.id, ticket.id));
      }
      return closed;
    });
    return { ticket: updated, approvalId, closed: true };
  }

  const updated = await db.transaction(async (tx) => {
    await tx.insert(schema.approvalRecords).values({
      id: approvalId,
      ticketId: ticket.id,
      approverId: approver.id,
      level,
      action: "reject",
      comment,
      idempotencyKey,
      createdAt: nowIso(),
    });

    const resubmitted = await transitionTicket(
      ticket,
      "pending",
      approver.id,
      "审批拒绝，退回待审批",
      { resubmitCount: ticket.resubmitCount + 1, assigneeId: null },
      tx
    );
    const deadline = await setApprovalDeadline(resubmitted, 1);
    await tx
      .update(schema.exceptionTickets)
      .set({ deadlineAt: deadline })
      .where(eq(schema.exceptionTickets.id, ticket.id));
    return resubmitted;
  });

  return { ticket: updated, approvalId, resubmitted: true };
}

export async function fastReleaseTicket(params: {
  ticket: ExceptionTicket;
  supervisor: User;
  reason: string;
  idempotencyKey?: string;
}) {
  const { ticket, supervisor, reason, idempotencyKey } = params;
  const db = getDb();

  if (ticket.category !== "qc") {
    throw new Error("仅品控工单支持快速放行");
  }

  if (ticket.status === "completed" || ticket.holdStatus === "fast_released") {
    const prior = await db.query.approvalRecords.findFirst({
      where: eq(schema.approvalRecords.ticketId, ticket.id),
    });
    return { ticket, approvalId: prior?.id || "", duplicate: true };
  }

  const existing = await findIdempotentApproval(idempotencyKey);
  if (existing) return { ticket, approvalId: existing.id, duplicate: true };

  const approvalId = newId();

  const updated = await db.transaction(async (tx) => {
    await tx.insert(schema.approvalRecords).values({
      id: approvalId,
      ticketId: ticket.id,
      approverId: supervisor.id,
      level: 0,
      action: "fast_release",
      comment: reason,
      idempotencyKey,
      createdAt: nowIso(),
    });

    await unlockBatch(ticket.id, approvalId, tx);

    const completed = await transitionTicket(
      ticket,
      "completed",
      supervisor.id,
      `品控主管误判快速放行: ${reason}`,
      { holdStatus: "fast_released", completedAt: nowIso() },
      tx
    );

    await tx
      .update(schema.scanRecords)
      .set({ batchStatus: "released" })
      .where(eq(schema.scanRecords.ticketId, ticket.id));

    return completed;
  });

  return { ticket: updated, approvalId };
}
