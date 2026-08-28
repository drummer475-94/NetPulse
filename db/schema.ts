import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ncSourceSnapshots = sqliteTable("nc_source_snapshots", {
  key: text("source_key").primaryKey(),
  payload: text("payload").notNull(),
  checksum: text("checksum").notNull(),
  observedAt: text("observed_at"),
  lastSuccessAt: text("last_success_at").notNull(),
  lastAttemptAt: text("last_attempt_at").notNull(),
  failureCategory: text("failure_category"),
});

export const ncIngestionLeases = sqliteTable("nc_ingestion_leases", {
  key: text("source_key").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});
