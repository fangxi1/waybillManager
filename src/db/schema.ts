import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

// ─── Users & Roles ───────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", {
    enum: [
      "reporter",
      "approver_l1",
      "approver_l2",
      "qc_supervisor",
      "admin",
    ],
  }).notNull(),
  warehouseId: text("warehouse_id"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ─── System Config (configurable rules) ────────────────────────
export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: text("updated_at").notNull(),
});

// ─── Approval Level Rules ──────────────────────────────────────
export const approvalRules = sqliteTable("approval_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  minAmount: real("min_amount").notNull().default(0),
  maxAmount: real("max_amount"),
  requiredLevel: integer("required_level").notNull(), // 1 or 2
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// ─── QC Rules ──────────────────────────────────────────────────
export const qcRules = sqliteTable("qc_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subType: text("sub_type", {
    enum: [
      "quantity_mismatch",
      "appearance_damage",
      "spec_mismatch",
      "label_error",
      "batch_anomaly",
    ],
  }).notNull(),
  conditionType: text("condition_type", {
    enum: ["quantity_diff_pct", "damage_level", "spec_deviation", "label_mismatch", "batch_invalid"],
  }).notNull(),
  threshold: real("threshold").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  autoCreateTicket: integer("auto_create_ticket", { mode: "boolean" }).notNull().default(true),
  autoApprovalLevel: integer("auto_approval_level").notNull().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ─── Waybill Snapshot (V3 local cache) ─────────────────────────
export const waybillSnapshots = sqliteTable(
  "waybill_snapshots",
  {
    waybillNo: text("waybill_no").primaryKey(),
    senderSummary: text("sender_summary").notNull(),
    receiverSummary: text("receiver_summary").notNull(),
    amount: real("amount").notNull(),
    warehouseId: text("warehouse_id"),
    status: text("status").notNull().default("active"),
    skuList: text("sku_list").notNull(), // JSON array
    syncedAt: text("synced_at").notNull(),
    dataSource: text("data_source", { enum: ["live", "cache"] }).notNull().default("live"),
  },
  (t) => [index("idx_snapshot_warehouse").on(t.warehouseId)]
);

// ─── API Sync Log ──────────────────────────────────────────────
export const apiSyncLogs = sqliteTable(
  "api_sync_logs",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    apiName: text("api_name").notNull(),
    method: text("method").notNull().default("GET"),
    requestSummary: text("request_summary"),
    responseStatus: integer("response_status"),
    durationMs: integer("duration_ms"),
    success: integer("success", { mode: "boolean" }).notNull(),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_sync_log_request_id").on(t.requestId),
    index("idx_sync_log_created").on(t.createdAt),
  ]
);

// ─── Exception Tickets ───────────────────────────────────────────
export const exceptionTickets = sqliteTable(
  "exception_tickets",
  {
    id: text("id").primaryKey(),
    waybillNo: text("waybill_no").notNull(),
    category: text("category", { enum: ["logistics", "qc"] }).notNull(),
    type: text("type").notNull(),
    source: text("source", { enum: ["manual", "scan"] }).notNull(),
    status: text("status", {
      enum: [
        "pending",
        "level1_review",
        "level2_review",
        "executing",
        "completed",
        "rejected_closed",
        "escalated",
      ],
    }).notNull(),
    description: text("description").notNull(),
    amount: real("amount").notNull().default(0),
    reporterId: text("reporter_id").notNull(),
    assigneeId: text("assignee_id"),
    resubmitCount: integer("resubmit_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    sku: text("sku"),
    batchId: text("batch_id"),
    holdStatus: text("hold_status", {
      enum: ["none", "held", "released", "fast_released"],
    }).notNull().default("none"),
    deadlineAt: text("deadline_at"),
    holdDeadlineAt: text("hold_deadline_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("idx_ticket_waybill").on(t.waybillNo),
    index("idx_ticket_status").on(t.status),
    index("idx_ticket_category").on(t.category),
    index("idx_ticket_assignee").on(t.assigneeId),
  ]
);

// ─── Approval Records ──────────────────────────────────────────
export const approvalRecords = sqliteTable(
  "approval_records",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").notNull(),
    approverId: text("approver_id").notNull(),
    level: integer("level").notNull(),
    action: text("action", {
      enum: ["approve", "reject", "escalate", "fast_release", "auto_escalate", "auto_reject", "reassign"],
    }).notNull(),
    comment: text("comment"),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_approval_ticket").on(t.ticketId),
    index("idx_approval_idempotency").on(t.idempotencyKey),
  ]
);

// ─── Compensation Records ──────────────────────────────────────
export const compensationRecords = sqliteTable("compensation_records", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  approvalRecordId: text("approval_record_id").notNull(),
  direction: text("direction", {
    enum: ["to_customer", "from_supplier"],
  }).notNull(),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["pending", "completed", "cancelled"] }).notNull(),
  settlementMethod: text("settlement_method"),
  createdAt: text("created_at").notNull(),
});

// ─── Inventory ─────────────────────────────────────────────────
export const inventory = sqliteTable(
  "inventory",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull(),
    batchId: text("batch_id").notNull(),
    waybillNo: text("waybill_no"),
    quantity: integer("quantity").notNull(),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    lockReason: text("lock_reason"),
    ticketId: text("ticket_id"),
    warehouseId: text("warehouse_id"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_inventory_sku_batch").on(t.sku, t.batchId),
    index("idx_inventory_locked").on(t.locked),
  ]
);

// ─── Inventory Change Log ──────────────────────────────────────
export const inventoryChanges = sqliteTable("inventory_changes", {
  id: text("id").primaryKey(),
  inventoryId: text("inventory_id").notNull(),
  ticketId: text("ticket_id").notNull(),
  approvalRecordId: text("approval_record_id").notNull(),
  changeType: text("change_type", {
    enum: ["lock", "unlock", "deduct", "add", "return"],
  }).notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── Scan Records ──────────────────────────────────────────────
export const scanRecords = sqliteTable(
  "scan_records",
  {
    id: text("id").primaryKey(),
    waybillNo: text("waybill_no").notNull(),
    sku: text("sku").notNull(),
    batchId: text("batch_id").notNull(),
    operatorId: text("operator_id").notNull(),
    deviceId: text("device_id"),
    qcResult: text("qc_result", { enum: ["pass", "fail"] }).notNull(),
    qcDescription: text("qc_description"),
    hitRuleId: text("hit_rule_id"),
    hitRuleReason: text("hit_rule_reason"),
    batchStatus: text("batch_status", {
      enum: ["scanned", "outbound", "held", "released"],
    }).notNull(),
    ticketId: text("ticket_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_scan_waybill_sku").on(t.waybillNo, t.sku),
    index("idx_scan_ticket").on(t.ticketId),
  ]
);

// ─── Ticket Status History (audit log) ─────────────────────────
export const ticketStatusHistory = sqliteTable("ticket_status_history", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  operatorId: text("operator_id"),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

export type User = typeof users.$inferSelect;
export type ExceptionTicket = typeof exceptionTickets.$inferSelect;
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type QcRule = typeof qcRules.$inferSelect;
