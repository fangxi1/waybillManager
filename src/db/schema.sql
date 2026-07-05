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
