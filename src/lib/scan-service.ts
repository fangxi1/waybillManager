import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { evaluateQc } from "./qc-engine";
import {
  findOpenQcTicketForBatch,
  getRequiredApprovalLevel,
  recordStatusChange,
  setApprovalDeadline,
  setHoldDeadline,
} from "./ticket-service";
import { getWaybill, validateSkuOnWaybill, writebackExceptionFlag } from "./v2-client";
import { newId, nowIso } from "./utils";

export async function processScan(params: {
  waybillNo: string;
  sku: string;
  batchId: string;
  operator: User;
  actualQuantity: number;
  expectedQuantity: number;
  damageLevel?: number;
  specDeviation?: number;
  labelMismatch?: boolean;
  batchInvalid?: boolean;
  deviceId?: string;
}) {
  const {
    waybillNo,
    sku,
    batchId,
    operator,
    actualQuantity,
    expectedQuantity,
    damageLevel,
    specDeviation,
    labelMismatch,
    batchInvalid,
    deviceId,
  } = params;

  const waybillResult = await getWaybill(waybillNo, true);
  if (!waybillResult.data) {
    throw new Error(waybillResult.error || "运单不存在，无法扫描");
  }

  if (
    operator.warehouseId &&
    waybillResult.data.warehouseId &&
    operator.warehouseId !== waybillResult.data.warehouseId
  ) {
    throw new Error(`无权操作其他仓库的运单（当前门店: ${waybillResult.data.warehouseId}）`);
  }

  const skuResult = await validateSkuOnWaybill(waybillNo, sku);
  if (!skuResult.data) {
    throw new Error("该 SKU 不属于此运单");
  }

  const existingTicket = await findOpenQcTicketForBatch(waybillNo, sku, batchId);
  if (existingTicket) {
    const db = getDb();
    const scanId = newId();
    await db.insert(schema.scanRecords).values({
      id: scanId,
      waybillNo,
      sku,
      batchId,
      operatorId: operator.id,
      deviceId: deviceId || null,
      qcResult: "fail",
      qcDescription: "重复扫描，批次已有未关闭品控工单",
      hitRuleId: null,
      hitRuleReason: "幂等性：不重复创建工单",
      batchStatus: "held",
      ticketId: existingTicket.id,
      createdAt: nowIso(),
    });
    return {
      duplicate: true,
      message: "该批次已存在未关闭品控工单，已追加扫描记录",
      ticketId: existingTicket.id,
      scanId,
    };
  }

  const qc = await evaluateQc({
    expectedQuantity,
    actualQuantity,
    damageLevel,
    specDeviation,
    labelMismatch,
    batchInvalid,
  });

  const db = getDb();
  const scanId = newId();

  if (qc.pass) {
    await db.insert(schema.scanRecords).values({
      id: scanId,
      waybillNo,
      sku,
      batchId,
      operatorId: operator.id,
      deviceId: deviceId || null,
      qcResult: "pass",
      qcDescription: qc.reason,
      hitRuleId: null,
      hitRuleReason: null,
      batchStatus: "outbound",
      ticketId: null,
      createdAt: nowIso(),
    });
    return { pass: true, message: "品控通过，正常出库", scanId };
  }

  const ticketId = newId();
  const amount = waybillResult.data.amount;
  const requiredLevel = await getRequiredApprovalLevel(amount);
  const initialStatus = requiredLevel === 2 ? "level2_review" : "level1_review";
  const deadline = await setApprovalDeadline(
    { createdAt: nowIso() } as never,
    requiredLevel === 2 ? 2 : 1
  );
  const holdDeadline = await setHoldDeadline();
  const now = nowIso();

  const invId = newId();
  await db.insert(schema.inventory).values({
    id: invId,
    sku,
    batchId,
    waybillNo,
    quantity: actualQuantity,
    locked: true,
    lockReason: "品控暂扣",
    ticketId,
    warehouseId: waybillResult.data.warehouseId,
    updatedAt: now,
  });

  await db.insert(schema.exceptionTickets).values({
    id: ticketId,
    waybillNo,
    category: "qc",
    type: qc.subType || "appearance_damage",
    source: "scan",
    status: initialStatus,
    description: qc.reason,
    amount,
    reporterId: operator.id,
    assigneeId: null,
    resubmitCount: 0,
    version: 1,
    sku,
    batchId,
    holdStatus: "held",
    deadlineAt: deadline,
    holdDeadlineAt: holdDeadline,
    createdAt: now,
    updatedAt: now,
  });

  await recordStatusChange(ticketId, null, initialStatus, operator.id, "扫描异常自动创建工单");

  writebackExceptionFlag(waybillNo, {
    hasOpenException: true,
    ticketId,
    status: initialStatus,
  }).catch(() => {});

  await db.insert(schema.scanRecords).values({
    id: scanId,
    waybillNo,
    sku,
    batchId,
    operatorId: operator.id,
    deviceId: deviceId || null,
    qcResult: "fail",
    qcDescription: qc.reason,
    hitRuleId: qc.hitRule?.id || null,
    hitRuleReason: qc.reason,
    batchStatus: "held",
    ticketId,
    createdAt: now,
  });

  await db.insert(schema.inventoryChanges).values({
    id: newId(),
    inventoryId: invId,
    ticketId,
    approvalRecordId: "scan_lock",
    changeType: "lock",
    quantityDelta: 0,
    reason: `品控暂扣锁定，命中规则: ${qc.hitRule?.name || "未知"}`,
    createdAt: now,
  });

  return {
    pass: false,
    message: `品控异常：${qc.reason}`,
    ticketId,
    scanId,
    hitRule: qc.hitRule?.name,
  };
}

export async function reportLogisticsException(params: {
  waybillNo: string;
  type: string;
  description: string;
  reporter: User;
}) {
  const { waybillNo, type, description, reporter } = params;

  const waybillResult = await getWaybill(waybillNo, true);
  if (!waybillResult.data) {
    throw new Error(waybillResult.error || "运单不存在，V2 接口校验失败");
  }

  if (
    reporter.warehouseId &&
    waybillResult.data.warehouseId &&
    reporter.warehouseId !== waybillResult.data.warehouseId
  ) {
    throw new Error(`无权对其他仓库的运单发起异常上报（运单门店: ${waybillResult.data.warehouseId}）`);
  }

  const { findOpenTicketSameType } = await import("./ticket-service");
  const existing = await findOpenTicketSameType(waybillNo, "logistics", type);
  if (existing) {
    throw new Error(`该运单已有同类型未关闭工单（${existing.status}）`);
  }

  const db = getDb();
  const ticketId = newId();
  const amount = waybillResult.data.amount;
  const now = nowIso();
  const deadline = await setApprovalDeadline({ createdAt: now } as never, 1);

  await db.insert(schema.exceptionTickets).values({
    id: ticketId,
    waybillNo,
    category: "logistics",
    type,
    source: "manual",
    status: "pending",
    description,
    amount,
    reporterId: reporter.id,
    assigneeId: null,
    resubmitCount: 0,
    version: 1,
    holdStatus: "none",
    deadlineAt: deadline,
    createdAt: now,
    updatedAt: now,
  });

  await recordStatusChange(ticketId, null, "pending", reporter.id, "手工上报物流异常");

  writebackExceptionFlag(waybillNo, {
    hasOpenException: true,
    ticketId,
    status: "pending",
  }).catch(() => {});

  return {
    ticketId,
    waybillSource: waybillResult.source,
    syncedAt: waybillResult.syncedAt,
    warning: waybillResult.error,
  };
}
