import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { setCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user || !user.enabled) {
    return NextResponse.json({ error: "用户不存在或已禁用" }, { status: 404 });
  }
  await setCurrentUser(userId);
  return NextResponse.json({ user });
}
