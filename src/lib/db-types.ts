import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "@/db/schema";

export type DbClient = LibSQLDatabase<typeof schema>;
