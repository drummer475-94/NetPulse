import {
  IODA_SITE_URL,
  SUMMARY_WINDOW_SECONDS,
  buildSummaryUrl,
  normalizeSummary,
} from "./ioda-source.mjs";
import type { OutageSnapshot } from "./outage-data";

/** Fetches the same 24-hour IODA summary used by the build-time snapshot. */
export async function fetchLiveSnapshot(now = new Date()): Promise<OutageSnapshot> {
  const untilSeconds = Math.floor(now.getTime() / 1000);
  const fromSeconds = untilSeconds - SUMMARY_WINDOW_SECONDS;
  const response = await fetch(buildSummaryUrl({ fromSeconds, untilSeconds }), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) {
    throw new Error(`IODA live summary returned HTTP ${response.status}`);
  }

  const envelope: unknown = await response.json();
  const events = normalizeSummary(envelope, { now, fromSeconds, untilSeconds });
  return {
    metadata: {
      mode: "live",
      sourceName: "IODA — Georgia Tech Internet Intelligence Lab",
      sourceUrl: IODA_SITE_URL,
      fetchedAt: now.toISOString(),
      note:
        events.length === 0
          ? "IODA reported no U.S. regional connectivity signals in the last 24 hours."
          : "Live browser refresh from IODA's U.S. regional outage summary for the last 24 hours.",
      copyright: "Source measurements and metadata: Georgia Institute of Technology IODA project.",
    },
    events,
  };
}
