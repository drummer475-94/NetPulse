import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IODA_SITE_URL,
  SUMMARY_WINDOW_SECONDS,
  buildSummaryUrl,
  normalizeSummary,
} from "../app/ioda-source.mjs";

const OUTPUT_PATH = process.env.NETPULSE_OUTAGE_OUTPUT_PATH
  ? resolve(process.env.NETPULSE_OUTAGE_OUTPUT_PATH)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../public/data/outages.json");

function isSnapshot(value) {
  return (
    value &&
    typeof value === "object" &&
    value.metadata &&
    typeof value.metadata === "object" &&
    Array.isArray(value.events)
  );
}

function unavailableSnapshot(fetchedAt) {
  return {
    metadata: {
      mode: "unavailable",
      sourceName: "IODA — Georgia Tech Internet Intelligence Lab",
      sourceUrl: IODA_SITE_URL,
      fetchedAt,
      note: "The live IODA summary could not be refreshed during this build.",
      copyright: "Source metadata: Georgia Institute of Technology IODA project.",
    },
    events: [],
  };
}

async function fetchSummary(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`IODA summary returned HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const now = new Date();
  const untilSeconds = Math.floor(now.getTime() / 1000);
  const fromSeconds = untilSeconds - SUMMARY_WINDOW_SECONDS;
  const url = buildSummaryUrl({ fromSeconds, untilSeconds });
  const envelope = await fetchSummary(url);
  const events = normalizeSummary(envelope, { now, fromSeconds, untilSeconds });
  const snapshot = {
    metadata: {
      mode: "live",
      sourceName: "IODA — Georgia Tech Internet Intelligence Lab",
      sourceUrl: IODA_SITE_URL,
      fetchedAt: now.toISOString(),
      note:
        events.length === 0
          ? "IODA reported no U.S. regional connectivity signals in the last 24 hours."
          : "Generated from IODA's U.S. regional outage summary for the last 24 hours.",
      copyright: "Source measurements and metadata: Georgia Institute of Technology IODA project.",
    },
    events,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${events.length} IODA summary signal${events.length === 1 ? "" : "s"} to ${OUTPUT_PATH}`);
}

main().catch(async (error) => {
  let fallbackMessage = "Preserved the valid checked-in snapshot without changing its mode.";
  try {
    const existing = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    if (!isSnapshot(existing)) throw new Error("Existing snapshot is invalid");
  } catch {
    const snapshot = unavailableSnapshot(new Date().toISOString());
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    fallbackMessage = "Wrote an explicit unavailable snapshot; no demo data was relabeled as live.";
  }
  console.warn(`IODA refresh skipped: ${error.message}`);
  console.warn(fallbackMessage);
  process.exitCode = 0;
});
