import { NextRequest, NextResponse } from "next/server";
import { processTimeouts } from "@/lib/ticket-service";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const processed = await processTimeouts();
  return NextResponse.json({ processed, at: new Date().toISOString() });
}
