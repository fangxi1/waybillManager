import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ExceptionTicket } from "@/db/schema";
import type { DbClient } from "./db-types";
import { transitionTicket } from "./ticket-service";
import { newId, nowIso } from "./utils";

type ExecutionAction =
  | "claim"
  | "reship"
  | "return_stock"
  | "release"
  | "return_supplier"
  | "repurchase"
  | "downgrade";

const LOGISTICS_ACTION_MAP: Record<string, ExecutionAction> = {
  lost: "claim",
  damaged: "claim",
  rejected: "return_stock",
  timeout_unsigned: "reship",
  address_error: "reship",
};

const QC_ACTION_MAP: Record<string, ExecutionAction> = {
  quantity_mismatch: "return_supplier",
  appearance_damage: "return_supplier",
  spec_mismatch: "downgrade",
  label_error: "release",
  batch_anomaly: "repurchase",
};

export async function executeApprovedAction(
  ticket: ExceptionTicket,
  approvalRecordId: string,
  dbClient?: DbClient
) {
  const db = dbClient ?? getDb();
  const action =
    ticket.category === "logistics"
      ? LOGISTICS_ACTION_MAP[ticket.type] || "claim"
      : QC_ACTION_MAP[ticket.type] || "release";

  switch (action) {
    case "claim":
      await createCompensation(ticket, approvalRecordId, "to_customer", ticket.amount * 0.8, db);
      break;
    case "reship":
      await adjustInventory(ticket, approvalRecordId, "deduct", -1, "重新发货扣减库存", db);
      break;
    case "return_stock":
      await adjustInventory(ticket, approvalRecordId, "add", 1, "退货入库", db);
      break;
    case "release":
      await unlockInventory(ticket, approvalRecordId, db);
      break;
    case "return_supplier":
      await createCompensation(ticket, approvalRecordId, "from_supplier", ticket.amount * 0.5, db);
      await adjustInventory(ticket, approvalRecordId, "return", 1, "退回供应商", db);
      break;
    case "repurchase":
      await createCompensation(ticket, approvalRecordId, "from_supplier", ticket.amount * 0.6, db);
      await adjustInventory(ticket, approvalRecordId, "deduct", -1, "批次作废重采购", db);
      break;
    case "downgrade":
      await createCompensation(ticket, approvalRecordId, "from_supplier", ticket.amount * 0.2, db);
      await unlockInventory(ticket, approvalRecordId, db);
      break;
  }

  if (ticket.holdStatus === "held") {
    await unlockInventory(ticket, approvalRecordId, db);
  }

  const completed = await transitionTicket(
    ticket,
    "completed",
    null,
    `执行完成: ${action}`,
    {
      completedAt: nowIso(),
      holdStatus: ticket.holdStatus === "held" ? "released" : ticket.holdStatus,
    },
    db
  );

  if (ticket.category === "qc") {
    await db
      .update(schema.scanRecords)
      .set({ batchStatus: "released" })
      .where(eq(schema.scanRecords.ticketId, ticket.id));
  }

  return { ticket: completed, action };
}

async function createCompensation(
  ticket: ExceptionTicket,
  approvalRecordId: string,
  direction: "to_customer" | "from_supplier",
  amount: number,
  db: DbClient
) {
  const existing = await db.query.compensationRecords.findFirst({
    where: eq(schema.compensationRecords.approvalRecordId, approvalRecordId),
  });
  if (existing) return existing;

  const [record] = await db
    .insert(schema.compensationRecords)
    .values({
      id: newId(),
      ticketId: ticket.id,
      approvalRecordId,
      direction,
      amount,
      status: "completed",
      settlementMethod: direction === "to_customer" ? "客户理赔账户" : "供应商追偿账单",
      createdAt: nowIso(),
    })
    .returning();
  return record;
}

async function adjustInventory(
  ticket: ExceptionTicket,
  approvalRecordId: string,
  changeType: "deduct" | "add" | "return",
  delta: number,
  reason: string,
  db: DbClient
) {
  if (!ticket.sku) return;

  let inv = await db.query.inventory.findFirst({
    where: eq(schema.inventory.ticketId, ticket.id),
  });

  if (!inv) {
    inv = (
      await db
        .insert(schema.inventory)
        .values({
          id: newId(),
          sku: ticket.sku,
          batchId: ticket.batchId || "default",
          waybillNo: ticket.waybillNo,
          quantity: 10,
          locked: false,
          warehouseId: null,
          updatedAt: nowIso(),
        })
        .returning()
    )[0];
  }

  const existingChange = await db.query.inventoryChanges.findFirst({
    where: eq(schema.inventoryChanges.approvalRecordId, approvalRecordId),
  });
  if (existingChange) return;

  const newQty = Math.max(0, inv.quantity + delta);
  await db
    .update(schema.inventory)
    .set({ quantity: newQty, updatedAt: nowIso() })
    .where(eq(schema.inventory.id, inv.id));

  await db.insert(schema.inventoryChanges).values({
    id: newId(),
    inventoryId: inv.id,
    ticketId: ticket.id,
    approvalRecordId,
    changeType,
    quantityDelta: delta,
    reason,
    createdAt: nowIso(),
  });
}

async function unlockInventory(ticket: ExceptionTicket, approvalRecordId: string, db: DbClient) {
  const items = await db.query.inventory.findMany({
    where: eq(schema.inventory.ticketId, ticket.id),
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
      ticketId: ticket.id,
      approvalRecordId,
      changeType: "unlock",
      quantityDelta: 0,
      reason: "审批通过解锁批次",
      createdAt: nowIso(),
    });
  }
}
