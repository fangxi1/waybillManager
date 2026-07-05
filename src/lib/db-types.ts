import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ResultSet } from "@libsql/client";
import type * as schema from "@/db/schema";

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

export type DbClient =
  | LibSQLDatabase<Schema>
  | SQLiteTransaction<"async", ResultSet, Schema, Relations>;
