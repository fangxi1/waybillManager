import { mkdirSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { DEFAULT_CONFIG } from "../lib/constants";
import { syncWaybillList } from "../lib/v2-client";
import { newId, nowIso, addHours } from "../lib/utils";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const LOGISTICS_TYPES = ["lost", "damaged", "rejected", "timeout_unsigned", "address_error"];
const QC_TYPES = ["quantity_mismatch", "appearance_damage", "spec_mismatch", "label_error", "batch_anomaly"];
const STATUSES = ["pending", "level1_review", "level2_review", "executing", "completed", "rejected_closed"];

async function main() {
  const url = process.env.DATABASE_URL || "file:./data/waybill-v3.db";
  if (url.startsWith("file:")) mkdirSync("./data", { recursive: true });

  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  console.log("Creating tables...");
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL, warehouse_id TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approval_rules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, min_amount REAL NOT NULL DEFAULT 0,
      max_amount REAL, required_level INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qc_rules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sub_type TEXT NOT NULL,
      condition_type TEXT NOT NULL, threshold REAL NOT NULL, severity TEXT NOT NULL,
      auto_create_ticket INTEGER NOT NULL DEFAULT 1, auto_approval_level INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS waybill_snapshots (
      waybill_no TEXT PRIMARY KEY, sender_summary TEXT NOT NULL, receiver_summary TEXT NOT NULL,
      amount REAL NOT NULL, warehouse_id TEXT, status TEXT NOT NULL DEFAULT 'active',
      sku_list TEXT NOT NULL, synced_at TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'live'
    );
    CREATE TABLE IF NOT EXISTS api_sync_logs (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL, api_name TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'GET',
      request_summary TEXT, response_status INTEGER, duration_ms INTEGER,
      success INTEGER NOT NULL, error_message TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exception_tickets (
      id TEXT PRIMARY KEY, waybill_no TEXT NOT NULL, category TEXT NOT NULL, type TEXT NOT NULL,
      source TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
      reporter_id TEXT NOT NULL, assignee_id TEXT, resubmit_count INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1, sku TEXT, batch_id TEXT,
      hold_status TEXT NOT NULL DEFAULT 'none', deadline_at TEXT, hold_deadline_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS approval_records (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, approver_id TEXT NOT NULL,
      level INTEGER NOT NULL, action TEXT NOT NULL, comment TEXT, idempotency_key TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS compensation_records (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, approval_record_id TEXT NOT NULL,
      direction TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL,
      settlement_method TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY, sku TEXT NOT NULL, batch_id TEXT NOT NULL, waybill_no TEXT,
      quantity INTEGER NOT NULL, locked INTEGER NOT NULL DEFAULT 0, lock_reason TEXT,
      ticket_id TEXT, warehouse_id TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_changes (
      id TEXT PRIMARY KEY, inventory_id TEXT NOT NULL, ticket_id TEXT NOT NULL,
      approval_record_id TEXT NOT NULL, change_type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_records (
      id TEXT PRIMARY KEY, waybill_no TEXT NOT NULL, sku TEXT NOT NULL, batch_id TEXT NOT NULL,
      operator_id TEXT NOT NULL, device_id TEXT, qc_result TEXT NOT NULL,
      qc_description TEXT, hit_rule_id TEXT, hit_rule_reason TEXT,
      batch_status TEXT NOT NULL, ticket_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_status_history (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
      operator_id TEXT, reason TEXT, created_at TEXT NOT NULL
    );
  `);

  console.log("Seeding users...");
  const users = [
    { id: "u-reporter", name: "李明", email: "li@wh-sh.com", role: "reporter", warehouseId: null },
    { id: "u-l1", name: "王芳", email: "wang@wh-sh.com", role: "approver_l1", warehouseId: null },
    { id: "u-l2", name: "张总", email: "zhang@corp.com", role: "approver_l2", warehouseId: null },
    { id: "u-qc", name: "陈主管", email: "chen@wh-sh.com", role: "qc_supervisor", warehouseId: null },
    { id: "u-admin", name: "系统管理员", email: "admin@corp.com", role: "admin", warehouseId: null },
    { id: "u-disabled", name: "已离职审批人", email: "old@corp.com", role: "approver_l1", warehouseId: null, enabled: false },
  ] as const;

  for (const u of users) {
    await db.insert(schema.users).values({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as never,
      warehouseId: u.warehouseId,
      enabled: "enabled" in u ? u.enabled : true,
      createdAt: nowIso(),
    }).onConflictDoNothing();
  }

  console.log("Seeding config...");
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await db.insert(schema.systemConfig).values({
      key,
      value,
      description: key,
      updatedAt: nowIso(),
    }).onConflictDoNothing();
  }

  await db.insert(schema.approvalRules).values([
    { id: "ar-1", name: "小额一级审批", minAmount: 0, maxAmount: 1000, requiredLevel: 1, priority: 1, enabled: true, createdAt: nowIso() },
    { id: "ar-2", name: "大额二级审批", minAmount: 1000, maxAmount: null, requiredLevel: 2, priority: 2, enabled: true, createdAt: nowIso() },
  ]).onConflictDoNothing();

  await db.insert(schema.qcRules).values([
    { id: "qr-1", name: "数量差异超5%", subType: "quantity_mismatch", conditionType: "quantity_diff_pct", threshold: 5, severity: "high", autoCreateTicket: true, autoApprovalLevel: 1, enabled: true, createdAt: nowIso() },
    { id: "qr-2", name: "破损等级≥3", subType: "appearance_damage", conditionType: "damage_level", threshold: 3, severity: "critical", autoCreateTicket: true, autoApprovalLevel: 2, enabled: true, createdAt: nowIso() },
    { id: "qr-3", name: "规格偏差超10%", subType: "spec_mismatch", conditionType: "spec_deviation", threshold: 10, severity: "medium", autoCreateTicket: true, autoApprovalLevel: 1, enabled: true, createdAt: nowIso() },
    { id: "qr-4", name: "标签错误", subType: "label_error", conditionType: "label_mismatch", threshold: 1, severity: "low", autoCreateTicket: true, autoApprovalLevel: 1, enabled: true, createdAt: nowIso() },
    { id: "qr-5", name: "批次异常", subType: "batch_anomaly", conditionType: "batch_invalid", threshold: 1, severity: "high", autoCreateTicket: true, autoApprovalLevel: 2, enabled: true, createdAt: nowIso() },
  ]).onConflictDoNothing();

  console.log("Syncing waybills from V2 (universal-import-v2)...");
  const syncResult = await syncWaybillList({ pageSize: 100 });
  const waybills = syncResult.data || [];
  if (!waybills.length) {
    console.warn("V2 未返回运单数据，请先确保 V2 已导入订单且 V2_API_BASE_URL 配置正确");
    console.warn(syncResult.error || "无错误信息");
  } else {
    console.log(`已从 V2 同步 ${waybills.length} 个运单快照`);
  }

  console.log("Generating 200+ tickets...");
  const existing = await db.select().from(schema.exceptionTickets).limit(1);
  if (existing.length === 0 && waybills.length === 0) {
    console.warn("跳过工单种子：无 V2 运单数据");
  }
  if (existing.length === 0 && waybills.length > 0) {
    for (let i = 0; i < 220; i++) {
      const isQc = i % 3 === 0;
      const category = isQc ? "qc" : "logistics";
      const type = isQc ? QC_TYPES[i % QC_TYPES.length] : LOGISTICS_TYPES[i % LOGISTICS_TYPES.length];
      const status = STATUSES[i % STATUSES.length];
      const wb = waybills[i % waybills.length];
      const ticketId = newId();
      const created = addHours(nowIso(), -i * 2);
      const reporterId = i % 5 === 0 ? "u-reporter" : "u-reporter";

      await db.insert(schema.exceptionTickets).values({
        id: ticketId,
        waybillNo: wb.waybillNo,
        category: category as never,
        type,
        source: isQc ? "scan" : "manual",
        status: status as never,
        description: `模拟工单 #${i + 1}: ${type} 异常`,
        amount: wb.amount,
        reporterId,
        assigneeId: status.includes("review") ? (status === "level2_review" ? "u-l2" : "u-l1") : null,
        resubmitCount: i % 7 === 0 ? 1 : 0,
        version: 1,
        sku: isQc ? wb.skus[0]?.sku : null,
        batchId: isQc ? wb.skus[0]?.batchId : null,
        holdStatus: isQc && status !== "completed" ? "held" : "none",
        deadlineAt: addHours(created, 48),
        holdDeadlineAt: isQc ? addHours(created, 4) : null,
        createdAt: created,
        updatedAt: created,
        completedAt: status === "completed" ? addHours(created, 24) : null,
      });

      await db.insert(schema.ticketStatusHistory).values({
        id: newId(),
        ticketId,
        fromStatus: null,
        toStatus: status,
        operatorId: reporterId,
        reason: "种子数据初始化",
        createdAt: created,
      });

      if (status === "completed" || status === "executing") {
        const approvalId = newId();
        await db.insert(schema.approvalRecords).values({
          id: approvalId,
          ticketId,
          approverId: "u-l1",
          level: 1,
          action: "approve",
          comment: "种子数据审批通过",
          createdAt: addHours(created, 12),
        });
        if (["lost", "damaged"].includes(type) || (isQc && type !== "label_error")) {
          await db.insert(schema.compensationRecords).values({
            id: newId(),
            ticketId,
            approvalRecordId: approvalId,
            direction: isQc ? "from_supplier" : "to_customer",
            amount: wb.amount * 0.5,
            status: "completed",
            settlementMethod: isQc ? "供应商追偿" : "客户理赔",
            createdAt: addHours(created, 13),
          });
        }
      }
    }
  }

  console.log("Seed complete!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
