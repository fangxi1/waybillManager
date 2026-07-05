import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { V2ApiResult, V2Waybill } from "./v2-types";
import { getConfigNumber, newRequestId, nowIso } from "./utils";

export type { V2Waybill, V2ApiResult };

const EMPTY_WAYBILL_ERROR = "运单号不能为空";

function normalizeWaybillNo(waybillNo: string): string {
  return String(waybillNo ?? "").trim();
}

function rejectEmptyWaybillNo<T>(
  apiName: string,
  waybillNo: string,
  requestId: string,
  start: number,
  requestSummary: string,
  method = "GET"
): V2ApiResult<T> | null {
  if (normalizeWaybillNo(waybillNo)) return null;
  void logApiCall({
    requestId,
    apiName,
    method,
    requestSummary,
    responseStatus: 0,
    durationMs: Date.now() - start,
    success: false,
    errorMessage: EMPTY_WAYBILL_ERROR,
  });
  return {
    data: null,
    source: "cache",
    syncedAt: nowIso(),
    requestId,
    error: EMPTY_WAYBILL_ERROR,
  };
}

function normalizeWaybill(raw: Partial<V2Waybill> | Record<string, unknown>): V2Waybill {
  const r = raw as Record<string, unknown>;
  const waybillNo = String(r.waybillNo ?? r.waybill_no ?? "").trim();
  const sender = String(r.senderSummary ?? r.sender_summary ?? "").trim();
  const receiver = String(r.receiverSummary ?? r.receiver_summary ?? "").trim();
  const amountRaw = r.amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw)
      ? amountRaw
      : Number(amountRaw) || 0;
  const skusRaw = r.skus;
  const skus = Array.isArray(skusRaw)
    ? skusRaw.map((s) => {
        const item = s as Record<string, unknown>;
        return {
          sku: String(item.sku ?? item.sku_code ?? ""),
          name: String(item.name ?? item.sku_name ?? item.sku ?? ""),
          quantity: Number(item.quantity ?? item.sku_quantity ?? 1) || 1,
          batchId: String(item.batchId ?? item.batch_id ?? "").slice(0, 8) || "unknown",
        };
      })
    : [];

  return {
    waybillNo,
    senderSummary: sender || "（发货方未知）",
    receiverSummary: receiver || "（收货方未知）",
    amount,
    warehouseId: String(r.warehouseId ?? r.warehouse_id ?? "").trim() || "DEFAULT",
    status: String(r.status ?? "").trim() || "imported",
    skus,
  };
}

function extractWaybillFromResponse(payload: unknown): V2Waybill | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const nested = obj.data;
  const raw =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : obj.waybillNo || obj.waybill_no
        ? obj
        : null;
  if (!raw) return null;
  const normalized = normalizeWaybill(raw);
  return normalized.waybillNo ? normalized : null;
}

function extractWaybillListFromResponse(payload: unknown): V2Waybill[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const list = Array.isArray(obj.data) ? obj.data : Array.isArray(payload) ? payload : [];
  return list
    .map((item) => extractWaybillFromResponse({ data: item }))
    .filter((wb): wb is V2Waybill => !!wb);
}

async function logApiCall(params: {
  requestId: string;
  apiName: string;
  method: string;
  requestSummary: string;
  responseStatus: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}) {
  const db = getDb();
  await db.insert(schema.apiSyncLogs).values({
    id: crypto.randomUUID(),
    requestId: params.requestId,
    apiName: params.apiName,
    method: params.method,
    requestSummary: params.requestSummary,
    responseStatus: params.responseStatus,
    durationMs: params.durationMs,
    success: params.success,
    errorMessage: params.errorMessage,
    createdAt: nowIso(),
  });
}

async function upsertSnapshot(waybill: V2Waybill, source: "live" | "cache") {
  const db = getDb();
  const syncedAt = nowIso();
  const wb = normalizeWaybill(waybill);
  await db
    .insert(schema.waybillSnapshots)
    .values({
      waybillNo: wb.waybillNo,
      senderSummary: wb.senderSummary,
      receiverSummary: wb.receiverSummary,
      amount: wb.amount,
      warehouseId: wb.warehouseId,
      status: wb.status,
      skuList: JSON.stringify(wb.skus),
      syncedAt,
      dataSource: source,
    })
    .onConflictDoUpdate({
      target: schema.waybillSnapshots.waybillNo,
      set: {
        senderSummary: wb.senderSummary,
        receiverSummary: wb.receiverSummary,
        amount: wb.amount,
        warehouseId: wb.warehouseId,
        status: wb.status,
        skuList: JSON.stringify(wb.skus),
        syncedAt,
        dataSource: source,
      },
    });
}

const DEFAULT_V2_BASE_URL =
  "https://universal-import-v2-fangxi1s-projects.vercel.app/api/integration";

function getV2BypassSecret() {
  return (
    process.env.V2_VERCEL_BYPASS_SECRET ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    ""
  ).trim();
}

function getV2BaseUrl() {
  const raw = (process.env.V2_API_BASE_URL || DEFAULT_V2_BASE_URL).trim();
  const url = raw.replace(/\/$/, "");

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(
      `V2_API_BASE_URL 必须是完整 URL（含 https://），当前值: ${raw || "(空)"}`
    );
  }
  if (url.includes("waybill-manager-v3")) {
    throw new Error("V2_API_BASE_URL 不能指向 V3 自身，请配置 universal-import-v2 地址");
  }
  return url;
}

async function fetchFromV2Api<T>(
  apiName: string,
  path: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number }
): Promise<{ data: T; status: number }> {
  const baseUrl = getV2BaseUrl();
  const apiKey = process.env.V2_API_KEY || "waybill-v3-secret-key";
  const bypassSecret = getV2BypassSecret();
  const timeout =
    options?.timeoutMs ?? (await getConfigNumber("v2_request_timeout_ms"));
  const retries = await getConfigNumber("v2_retry_count");

  let lastError: Error | null = null;
  const requestUrl = (() => {
    const url = new URL(`${baseUrl}${path}`);
    if (bypassSecret) {
      url.searchParams.set("x-vercel-protection-bypass", bypassSecret);
    }
    return url.toString();
  })();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      };
      if (bypassSecret) {
        headers["x-vercel-protection-bypass"] = bypassSecret;
      }

      const res = await fetch(requestUrl, {
        method: options?.method || "GET",
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);

      const text = await res.text();
      const trimmed = text.trim();

      if (!res.ok) {
        const preview = trimmed.slice(0, 120).replace(/\s+/g, " ");
        const hint = detectHtmlResponseHint(trimmed);
        throw new Error(`V2 API ${res.status}: ${preview}${hint}`);
      }

      if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
        throw new Error(
          `V2 API 返回 HTML 而非 JSON（${requestUrl}）${detectHtmlResponseHint(trimmed)}`
        );
      }

      let data: T;
      try {
        data = JSON.parse(trimmed) as T;
      } catch {
        throw new Error(
          `V2 API 响应非 JSON: ${trimmed.slice(0, 120).replace(/\s+/g, " ")}`
        );
      }
      return { data, status: res.status };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error(
          `V2 API 请求超时（${timeout}ms）: ${apiName} ${path}`
        );
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error("V2 API call failed");
}

function detectHtmlResponseHint(body: string) {
  if (body.includes("Log in to Vercel") || body.includes("vercel.com/login")) {
    return "（V2 部署启用了 Vercel 保护，请配置 V2_VERCEL_BYPASS_SECRET）";
  }
  if (body.includes("运单全流程管理 V3")) {
    return "（响应来自 V3 而非 V2，请检查 V2_API_BASE_URL）";
  }
  return "";
}

async function getCachedWaybill(waybillNo: string): Promise<V2Waybill | null> {
  const db = getDb();
  const snap = await db.query.waybillSnapshots.findFirst({
    where: eq(schema.waybillSnapshots.waybillNo, waybillNo),
  });
  if (!snap) return null;
  return {
    waybillNo: snap.waybillNo,
    senderSummary: snap.senderSummary,
    receiverSummary: snap.receiverSummary,
    amount: snap.amount,
    warehouseId: snap.warehouseId || "",
    status: snap.status,
    skus: JSON.parse(snap.skuList),
  };
}

async function getAllCachedWaybills(): Promise<V2Waybill[]> {
  const db = getDb();
  const snaps = await db.query.waybillSnapshots.findMany();
  return snaps.map((snap) => ({
    waybillNo: snap.waybillNo,
    senderSummary: snap.senderSummary,
    receiverSummary: snap.receiverSummary,
    amount: snap.amount,
    warehouseId: snap.warehouseId || "",
    status: snap.status,
    skus: JSON.parse(snap.skuList),
  }));
}

export async function getWaybill(waybillNo: string, live = true): Promise<V2ApiResult<V2Waybill>> {
  const requestId = newRequestId();
  const start = Date.now();
  const normalizedNo = normalizeWaybillNo(waybillNo);
  const rejected = rejectEmptyWaybillNo<V2Waybill>(
    "getWaybill",
    waybillNo,
    requestId,
    start,
    `waybillNo=${waybillNo}`
  );
  if (rejected) return rejected;

  if (live) {
    try {
      const { data, status } = await fetchFromV2Api<unknown>(
        "getWaybill",
        `/waybills/${encodeURIComponent(normalizedNo)}`
      );
      const waybill = extractWaybillFromResponse(data);
      if (!waybill) {
        throw new Error("V2 返回运单数据格式无效");
      }
      await upsertSnapshot(waybill, "live");
      await logApiCall({
        requestId,
        apiName: "getWaybill",
        method: "GET",
        requestSummary: `waybillNo=${normalizedNo}`,
        responseStatus: status,
        durationMs: Date.now() - start,
        success: true,
      });
      return { data: waybill, source: "live", syncedAt: nowIso(), requestId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logApiCall({
        requestId,
        apiName: "getWaybill",
        method: "GET",
        requestSummary: `waybillNo=${normalizedNo}`,
        responseStatus: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: msg,
      });
      const cached = await getCachedWaybill(normalizedNo);
      if (cached) {
        const snap = await getDb().query.waybillSnapshots.findFirst({
          where: eq(schema.waybillSnapshots.waybillNo, normalizedNo),
        });
        return {
          data: cached,
          source: "cache",
          syncedAt: snap?.syncedAt || nowIso(),
          requestId,
          error: `V2 服务不可用，使用本地缓存: ${msg}`,
        };
      }
      return { data: null, source: "cache", syncedAt: nowIso(), requestId, error: msg };
    }
  }

  const cached = await getCachedWaybill(normalizedNo);
  const snap = cached
    ? await getDb().query.waybillSnapshots.findFirst({
        where: eq(schema.waybillSnapshots.waybillNo, normalizedNo),
      })
    : null;
  return {
    data: cached,
    source: "cache",
    syncedAt: snap?.syncedAt || nowIso(),
    requestId,
  };
}

export async function validateSkuOnWaybill(
  waybillNo: string,
  sku: string
): Promise<V2ApiResult<boolean>> {
  const requestId = newRequestId();
  const start = Date.now();
  const normalizedNo = normalizeWaybillNo(waybillNo);
  const rejected = rejectEmptyWaybillNo<boolean>(
    "validateSku",
    waybillNo,
    requestId,
    start,
    `waybillNo=${waybillNo}, sku=${sku}`
  );
  if (rejected) return rejected;

  try {
    const { data, status } = await fetchFromV2Api<{ valid: boolean }>(
      "validateSku",
      `/waybills/${encodeURIComponent(normalizedNo)}/skus/${encodeURIComponent(sku)}/validate`
    );
    await logApiCall({
      requestId,
      apiName: "validateSku",
      method: "GET",
      requestSummary: `waybillNo=${normalizedNo}, sku=${sku}`,
      responseStatus: status,
      durationMs: Date.now() - start,
      success: true,
    });
    return { data: data.valid, source: "live", syncedAt: nowIso(), requestId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      requestId,
      apiName: "validateSku",
      method: "GET",
      requestSummary: `waybillNo=${normalizedNo}, sku=${sku}`,
      responseStatus: 0,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: msg,
    });
    const cached = await getCachedWaybill(normalizedNo);
    if (cached) {
      const valid = cached.skus.some((s) => s.sku === sku);
      return {
        data: valid,
        source: "cache",
        syncedAt: nowIso(),
        requestId,
        error: `V2 不可用，使用缓存校验: ${msg}`,
      };
    }
    return { data: false, source: "cache", syncedAt: nowIso(), requestId, error: msg };
  }
}

export async function syncWaybillList(params?: {
  warehouseId?: string;
  page?: number;
  pageSize?: number;
}): Promise<V2ApiResult<V2Waybill[]>> {
  const requestId = newRequestId();
  const start = Date.now();
  const qs = new URLSearchParams();
  if (params?.warehouseId) qs.set("warehouseId", params.warehouseId);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));

  try {
    const { data, status } = await fetchFromV2Api<unknown>(
      "listWaybills",
      `/waybills?${qs.toString()}`,
      { timeoutMs: 60000 }
    );
    const waybills = extractWaybillListFromResponse(data);
    for (const wb of waybills) {
      await upsertSnapshot(wb, "live");
    }
    await logApiCall({
      requestId,
      apiName: "listWaybills",
      method: "GET",
      requestSummary: qs.toString() || "all",
      responseStatus: status,
      durationMs: Date.now() - start,
      success: true,
    });
    return { data: waybills, source: "live", syncedAt: nowIso(), requestId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      requestId,
      apiName: "listWaybills",
      method: "GET",
      requestSummary: qs.toString() || "all",
      responseStatus: 0,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: msg,
    });
    const cached = await getAllCachedWaybills();
    return {
      data: cached,
      source: "cache",
      syncedAt: nowIso(),
      requestId,
      error: msg,
    };
  }
}

export async function writebackExceptionFlag(
  waybillNo: string,
  payload: { hasOpenException: boolean; ticketId: string; status: string }
): Promise<V2ApiResult<boolean>> {
  const requestId = newRequestId();
  const start = Date.now();
  const normalizedNo = normalizeWaybillNo(waybillNo);
  const rejected = rejectEmptyWaybillNo<boolean>(
    "writebackException",
    waybillNo,
    requestId,
    start,
    JSON.stringify(payload),
    "POST"
  );
  if (rejected) return rejected;

  try {
    const { data, status } = await fetchFromV2Api<{ ok: boolean }>(
      "writebackException",
      `/waybills/${encodeURIComponent(normalizedNo)}/exception-flag`,
      { method: "POST", body: payload }
    );
    await logApiCall({
      requestId,
      apiName: "writebackException",
      method: "POST",
      requestSummary: JSON.stringify(payload),
      responseStatus: status,
      durationMs: Date.now() - start,
      success: true,
    });
    return { data: data.ok, source: "live", syncedAt: nowIso(), requestId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      requestId,
      apiName: "writebackException",
      method: "POST",
      requestSummary: JSON.stringify(payload),
      responseStatus: 0,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: msg,
    });
    return { data: false, source: "cache", syncedAt: nowIso(), requestId, error: msg };
  }
}
