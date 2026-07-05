import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    execSync("npx tsx src/db/migrate.ts", { stdio: "inherit" });
    execSync("npx tsx src/db/seed.ts", { stdio: "inherit" });
    return NextResponse.json({ ok: true, message: "Database migrated and seeded" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
