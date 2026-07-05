export interface V2Waybill {
  waybillNo: string;
  senderSummary: string;
  receiverSummary: string;
  amount: number;
  warehouseId: string;
  status: string;
  skus: Array<{ sku: string; name: string; quantity: number; batchId: string }>;
}

export interface V2ApiResult<T> {
  data: T | null;
  source: "live" | "cache";
  syncedAt: string;
  requestId: string;
  error?: string;
}
