import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEFAULT_CONFIG, type ConfigKey } from "./constants";

export async function getConfig(key: ConfigKey): Promise<string> {
  const db = getDb();
  const row = await db.query.systemConfig.findFirst({
    where: eq(schema.systemConfig.key, key),
  });
  return row?.value ?? DEFAULT_CONFIG[key];
}

export async function getConfigNumber(key: ConfigKey): Promise<number> {
  return Number(await getConfig(key));
}

export async function setConfig(key: ConfigKey, value: string, description?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .insert(schema.systemConfig)
    .values({ key, value, description, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value, description, updatedAt: now },
    });
}

export function nowIso() {
  return new Date().toISOString();
}

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}

export function newId() {
  return uuidv4();
}

export function newRequestId() {
  return `req_${uuidv4().slice(0, 12)}`;
}
