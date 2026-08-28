CREATE TABLE `nc_source_snapshots` (`source_key` text PRIMARY KEY NOT NULL, `payload` text NOT NULL, `checksum` text NOT NULL, `observed_at` text, `last_success_at` text NOT NULL, `last_attempt_at` text NOT NULL, `failure_category` text);
--> statement-breakpoint
CREATE TABLE `nc_ingestion_leases` (`source_key` text PRIMARY KEY NOT NULL, `expires_at` integer NOT NULL);
