import { and, eq, inArray, not } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ExceptionTicket } from "@/db/schema";
import type { DbClient } from "./db-types";
import { sendDingTalkAlert } from "./notify-service";
import { getConfigNumber, addHours, newId, nowIso } from "./utils";

type OpenTicketStatus = "pending" | "level1_review" | "level2_review" | "executing" | "escalated";
const OPEN_STATUSES: OpenTicketStatus[] = ["pending", "level1_review", "level2_review", "executing", "escalated"];
const REVIEW_STATUSES: Array<"pending" | "level1_review" | "level2_review"> = ["pending", "level1_review", "level2_review"];

export async function getRequiredApprovalLevel(amount: number): Promise<1 | 2> {
  const db = getDb();
  const rules = await db.query.approvalRules.findMany({
    where: eq(schema.approvalRules.enabled, true),
  });
  rules.sort((a, b) => b.priority - a.priority);

  for (const rule of rules) {
    if (amount >= rule.minAmount && (rule.maxAmount == null || amount < rule.maxAmount)) {
      return rule.requiredLevel as 1 | 2;
    }
  }

  const threshold = await getConfigNumber("approval_level2_threshold");
  return amount >= threshold ? 2 : 1;
}

export async function recordStatusChange(
  ticketId: string,
  fromStatus: string | null,
  toStatus: string,
  operatorId: string | null,
  reason: string,
  dbClient?: DbClient
) {
  const db = dbClient ?? getDb();
  await db.insert(schema.ticketStatusHistory).values({
    id: newId(),
    ticketId,
    fromStatus,
    toStatus,
    operatorId,
    reason,
    createdAt: nowIso(),
  });
}

export async function transitionTicket(
  ticket: ExceptionTicket,
  toStatus: ExceptionTicket["status"],
  operatorId: string | null,
  reason: string,
  extra?: Partial<typeof schema.exceptionTickets.$inferInsert>,
  dbClient?: DbClient
) {
  const db = dbClient ?? getDb();
  const now = nowIso();

  const [updated] = await db
    .update(schema.exceptionTickets)
    .set({
      status: toStatus,
      updatedAt: now,
      version: ticket.version + 1,
      ...extra,
    })
    .where(
      and(
        eq(schema.exceptionTickets.id, ticket.id),
        eq(schema.exceptionTickets.version, ticket.version)
      )
    )
    .returning();

  if (!updated) {
    throw new ConflictError("该工单已被处理，请刷新后重试");
  }

  await recordStatusChange(ticket.id, ticket.status, toStatus, operatorId, reason, db);
  return updated;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export async function findOpenTicketSameType(
  waybillNo: string,
  category: string,
  type: string
) {
  const db = getDb();
  const openStatuses = OPEN_STATUSES;
  return db.query.exceptionTickets.findFirst({
    where: and(
      eq(schema.exceptionTickets.waybillNo, waybillNo),
      eq(schema.exceptionTickets.category, category as "logistics" | "qc"),
      eq(schema.exceptionTickets.type, type),
      inArray(schema.exceptionTickets.status, openStatuses)
    ),
  });
}

export async function findOpenQcTicketForBatch(waybillNo: string, sku: string, batchId: string) {
  const db = getDb();
  const openStatuses = OPEN_STATUSES;
  return db.query.exceptionTickets.findFirst({
    where: and(
      eq(schema.exceptionTickets.waybillNo, waybillNo),
      eq(schema.exceptionTickets.category, "qc"),
      eq(schema.exceptionTickets.sku, sku),
      eq(schema.exceptionTickets.batchId, batchId),
      inArray(schema.exceptionTickets.status, openStatuses)
    ),
  });
}

export async function setApprovalDeadline(
  ticket: ExceptionTicket,
  level: 1 | 2
): Promise<string> {
  const hours =
    level === 1
      ? await getConfigNumber("approval_timeout_level1_hours")
      : await getConfigNumber("approval_timeout_level2_hours");
  return addHours(nowIso(), hours);
}

export async function setHoldDeadline(): Promise<string> {
  const hours = await getConfigNumber("qc_hold_timeout_hours");
  return addHours(nowIso(), hours);
}

export async function reassignDisabledApproverTickets() {
  const db = getDb();
  const disabledUsers = await db.query.users.findMany({
    where: eq(schema.users.enabled, false),
  });
  if (disabledUsers.length === 0) return 0;

  const disabledIds = disabledUsers.map((u) => u.id);
  const pendingTickets = await db.query.exceptionTickets.findMany({
    where: and(
      inArray(schema.exceptionTickets.assigneeId, disabledIds),
      inArray(schema.exceptionTickets.status, REVIEW_STATUSES)
    ),
  });

  let count = 0;
  for (const ticket of pendingTickets) {
    const role = ticket.status === "level2_review" ? "approver_l2" : "approver_l1";
    const replacement = await db.query.users.findFirst({
      where: and(eq(schema.users.role, role), eq(schema.users.enabled, true)),
    });
    if (replacement) {
      await db
        .update(schema.exceptionTickets)
        .set({ assigneeId: replacement.id, updatedAt: nowIso() })
        .where(eq(schema.exceptionTickets.id, ticket.id));

      await db.insert(schema.approvalRecords).values({
        id: newId(),
        ticketId: ticket.id,
        approverId: "system",
        level: ticket.status === "level2_review" ? 2 : 1,
        action: "reassign",
        comment: `审批人账号已禁用，自动转交给 ${replacement.name}`,
        createdAt: nowIso(),
      });
      count++;
    }
  }
  return count;
}

export async function processTimeouts() {
  const db = getDb();
  const now = nowIso();
  let processed = 0;

  const tickets = await db.query.exceptionTickets.findMany({
    where: inArray(schema.exceptionTickets.status, REVIEW_STATUSES),
  });

  for (const ticket of tickets) {
    if (!ticket.deadlineAt || ticket.deadlineAt > now) continue;

    if (ticket.status === "pending" || ticket.status === "level1_review") {
      const updated = await transitionTicket(
        ticket,
        "level2_review",
        null,
        "审批超时，自动升级至二级审批"
      );
      await db.insert(schema.approvalRecords).values({
        id: newId(),
        ticketId: ticket.id,
        approverId: "system",
        level: 2,
        action: "auto_escalate",
        comment: "审批超时自动升级",
        createdAt: nowIso(),
      });
      const deadline = await setApprovalDeadline(updated, 2);
      await db
        .update(schema.exceptionTickets)
        .set({ deadlineAt: deadline, assigneeId: null })
        .where(eq(schema.exceptionTickets.id, ticket.id));
      processed++;
      void sendDingTalkAlert(
        "工单审批超时升级",
        `工单 **${ticket.id.slice(0, 8)}** 已自动升级至二级审批\n运单号: ${ticket.waybillNo}`
      );
    } else if (ticket.status === "level2_review") {
      await transitionTicket(ticket, "rejected_closed", null, "二级审批超时，自动驳回关闭");
      await db.insert(schema.approvalRecords).values({
        id: newId(),
        ticketId: ticket.id,
        approverId: "system",
        level: 2,
        action: "auto_reject",
        comment: "二级审批超时自动驳回",
        createdAt: nowIso(),
      });
      if (ticket.holdStatus === "held") {
        await db
          .update(schema.inventory)
          .set({ locked: false, lockReason: null, updatedAt: nowIso() })
          .where(eq(schema.inventory.ticketId, ticket.id));
      }
      processed++;
      void sendDingTalkAlert(
        "工单审批超时关闭",
        `工单 **${ticket.id.slice(0, 8)}** 二级审批超时，已自动驳回关闭\n运单号: ${ticket.waybillNo}`
      );
    }
  }

  const heldTickets = await db.query.exceptionTickets.findMany({
    where: and(
      eq(schema.exceptionTickets.holdStatus, "held"),
      not(eq(schema.exceptionTickets.status, "completed")),
      not(eq(schema.exceptionTickets.status, "rejected_closed"))
    ),
  });

  for (const ticket of heldTickets) {
    if (!ticket.holdDeadlineAt || ticket.holdDeadlineAt > now) continue;
    if (ticket.status === "level2_review") continue;

    const fresh = await db.query.exceptionTickets.findFirst({
      where: eq(schema.exceptionTickets.id, ticket.id),
    });
    if (!fresh) continue;

    await transitionTicket(fresh, "level2_review", null, "品控暂扣超时，强制升级二级审批");
    await db.insert(schema.approvalRecords).values({
      id: newId(),
      ticketId: ticket.id,
      approverId: "system",
      level: 2,
      action: "escalate",
      comment: "品控暂扣超时强制升级",
      createdAt: nowIso(),
    });
    const deadline = await setApprovalDeadline(fresh, 2);
    await db
      .update(schema.exceptionTickets)
      .set({ deadlineAt: deadline })
      .where(eq(schema.exceptionTickets.id, ticket.id));
    processed++;
    void sendDingTalkAlert(
      "品控暂扣超时升级",
      `工单 **${ticket.id.slice(0, 8)}** 品控暂扣超时，已强制升级二级审批\n运单号: ${ticket.waybillNo}`
    );
  }

  await reassignDisabledApproverTickets();
  return processed;
}
