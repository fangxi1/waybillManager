import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const db = getDb();
  const users = await db.query.users.findMany({
    where: eq(schema.users.enabled, true),
  });

  return NextResponse.json({ currentUser: user, users });
}
