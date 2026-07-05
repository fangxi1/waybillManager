import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let _db: LibSQLDatabase<typeof schema> | null = null;

function getClient(): Client {
  const url = process.env.DATABASE_URL || "file:./data/waybill-v3.db";
  return createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
  }
  return _db;
}

export { schema };
