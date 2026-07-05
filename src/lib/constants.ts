export const DEFAULT_CONFIG = {
  approval_level2_threshold: "1000",
  approval_timeout_level1_hours: "48",
  approval_timeout_level2_hours: "72",
  qc_hold_timeout_hours: "4",
  resubmit_max_count: "3",
  approval_auto_reject_after_escalate_hours: "96",
  v2_request_timeout_ms: "45000",
  v2_retry_count: "2",
} as const;

export type ConfigKey = keyof typeof DEFAULT_CONFIG;

export const LOGISTICS_TYPES = [
  "lost",
  "damaged",
  "rejected",
  "timeout_unsigned",
  "address_error",
] as const;

export const QC_TYPES = [
  "quantity_mismatch",
  "appearance_damage",
  "spec_mismatch",
  "label_error",
  "batch_anomaly",
] as const;

export const LOGISTICS_TYPE_LABELS: Record<string, string> = {
  lost: "丢件",
  damaged: "破损",
  rejected: "客户拒收",
  timeout_unsigned: "超时未签收",
  address_error: "收货地址错误",
};

export const QC_TYPE_LABELS: Record<string, string> = {
  quantity_mismatch: "数量不符",
  appearance_damage: "外观破损",
  spec_mismatch: "规格不符",
  label_error: "标签错误",
  batch_anomaly: "批次异常",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  pending: "待审批",
  level1_review: "一级审批中",
  level2_review: "二级审批中",
  executing: "执行中",
  completed: "已完成",
  rejected_closed: "已关闭",
  escalated: "已升级",
};

export const ROLE_LABELS: Record<string, string> = {
  reporter: "异常上报员",
  approver_l1: "一级审批人",
  approver_l2: "二级审批人",
  qc_supervisor: "品控主管",
  admin: "系统管理员",
};
