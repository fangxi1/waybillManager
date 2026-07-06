import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { classifyException } from "@/lib/ai-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json();
  if (!body.description?.trim()) {
    return NextResponse.json({ error: "请提供异常描述" }, { status: 400 });
  }

  const result = await classifyException(
    body.description,
    body.category === "qc" ? "qc" : "logistics"
  );

  return NextResponse.json(result);
}
