import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canReport } from "@/lib/auth";
import { processScan } from "@/lib/scan-service";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canReport(user)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await req.json();
    const result = await processScan({
      waybillNo: body.waybillNo,
      sku: body.sku,
      batchId: body.batchId,
      operator: user,
      actualQuantity: Number(body.actualQuantity),
      expectedQuantity: Number(body.expectedQuantity),
      damageLevel: body.damageLevel != null ? Number(body.damageLevel) : undefined,
      specDeviation: body.specDeviation != null ? Number(body.specDeviation) : undefined,
      labelMismatch: body.labelMismatch,
      batchInvalid: body.batchInvalid,
      deviceId: body.deviceId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "扫描失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
