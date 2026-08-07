import states from "./us-states.json" with { type: "json" };

export const IODA_API_ROOT = "https://api.ioda.inetintel.cc.gatech.edu/v2/";
export const IODA_SITE_URL = "https://ioda.inetintel.cc.gatech.edu/";
export const SUMMARY_WINDOW_SECONDS = 24 * 60 * 60;

// IODA's `overall` score is an aggregate, not a percentage. Keep these named so
// the UI and build snapshot use the same, auditable interpretation.
export const MODERATE_OVERALL_SCORE_THRESHOLD = 10;
export const MAJOR_OVERALL_SCORE_THRESHOLD = 1000;

const STATES_BY_NAME = new Map(
  states.map((state) => [normalizeName(state.name), state]),
);
const STATES_BY_ABBR = new Map(
  states.map((state) => [state.abbr.toUpperCase(), state]),
);

function normalizeName(value) {
  return String(value ?? "")
    .replace(/,?\s*(united states|usa)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function summaryRows(envelope) {
  if (envelope && typeof envelope === "object" && Array.isArray(envelope.data)) {
    return envelope.data;
  }
  return [];
}

function entityName(entity) {
  return entity && typeof entity === "object" ? entity.name : undefined;
}

function entityCode(entity) {
  return entity && typeof entity === "object" ? entity.code : undefined;
}

/**
 * Finds a U.S. state from the IODA entity's display name. IODA region entities
 * only reliably expose `name` and a numeric code, so names are deliberately
 * preferred; code support only covers an explicit state abbreviation.
 */
export function matchState(name, code) {
  const byName = STATES_BY_NAME.get(normalizeName(name));
  if (byName) return byName;

  const candidate = String(code ?? "")
    .toUpperCase()
    .replace(/^US-/, "")
    .split(/[/:]/)
    .at(-1);
  return STATES_BY_ABBR.get(candidate) ?? null;
}

export function buildSummaryUrl({ fromSeconds, untilSeconds }) {
  const url = new URL("outages/summary", IODA_API_ROOT);
  url.searchParams.set("entityType", "region");
  url.searchParams.set("relatedTo", "country/US");
  url.searchParams.set("from", String(Math.floor(fromSeconds)));
  url.searchParams.set("until", String(Math.floor(untilSeconds)));
  return url.toString();
}

export function severityForSummary({ overall }) {
  if (overall >= MAJOR_OVERALL_SCORE_THRESHOLD) return "major";
  // Summary rows have no lifecycle or timing evidence, so they must never be
  // presented as recovering. Non-major user-facing rows are moderate.
  return "moderate";
}

/**
 * Converts IODA's regional outage summary to NetPulse signals.
 *
 * The summary response deliberately has no event start/end/update fields.
 * Do not use the query window or fetch time as invented event timestamps.
 * @param {{ now?: Date | number | string, fromSeconds?: number, untilSeconds?: number }} [options]
 */
export function normalizeSummary(envelope, options = {}) {
  const { now = new Date(), fromSeconds, untilSeconds } = options;
  const nowDate = now instanceof Date ? now : new Date(now);
  const effectiveUntil = Number.isFinite(untilSeconds)
    ? Math.floor(untilSeconds)
    : Math.floor(nowDate.getTime() / 1000);
  const effectiveFrom = Number.isFinite(fromSeconds)
    ? Math.floor(fromSeconds)
    : effectiveUntil - SUMMARY_WINDOW_SECONDS;
  const sourceUrl = buildSummaryUrl({
    fromSeconds: effectiveFrom,
    untilSeconds: effectiveUntil,
  });
  const seenStates = new Set();

  return summaryRows(envelope)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const state = matchState(entityName(row.entity), entityCode(row.entity));
      if (!state || seenStates.has(state.abbr)) return null;

      const overall = asNumber(row.scores?.overall) ?? 0;
      const eventCount = asNumber(row.event_cnt) ?? 0;
      // A summary row without an event and below the low-score threshold is
      // not a user-facing signal. This avoids treating baseline noise as a
      // recovered outage when the source supplies no lifecycle information.
      if (eventCount <= 0 && overall < MODERATE_OVERALL_SCORE_THRESHOLD) return null;
      seenStates.add(state.abbr);

      const severity = severityForSummary({ overall, eventCount });
      const eventWord = eventCount === 1 ? "event" : "events";
      return {
        id: `ioda-summary-${state.abbr.toLowerCase()}`,
        kind: "internet",
        title:
          severity === "major"
            ? "Major regional connectivity signal"
            : "Regional connectivity signal",
        region: state.name,
        state: state.abbr,
        name: `${state.name} (state-level signal)`,
        lat: state.lat,
        lon: state.lon,
        provider: "Multiple networks",
        network: "Regional internet measurements",
        detectionSource: "IODA regional outage summary",
        severity,
        status: "Recorded in the last 24 hours",
        summary: `IODA recorded ${eventCount} ${eventWord} with an overall score of ${overall.toLocaleString("en-US", { maximumFractionDigits: 3 })}.`,
        sourceUrl,
        demo: false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const severityOrder = { major: 2, moderate: 1, recovering: 0 };
      return severityOrder[b.severity] - severityOrder[a.severity] || a.state.localeCompare(b.state);
    });
}
