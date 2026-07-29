import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = "https://api.ioda.inetintel.cc.gatech.edu/v2/";
const IODA_SITE = "https://ioda.inetintel.cc.gatech.edu/";
const OUTPUT_PATH = process.env.NETPULSE_OUTAGE_OUTPUT_PATH
  ? resolve(process.env.NETPULSE_OUTAGE_OUTPUT_PATH)
  : resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../public/data/outages.json",
    );
const HOUR = 60 * 60;
const nowSeconds = Math.floor(Date.now() / 1000);
const fromSeconds = nowSeconds - 36 * HOUR;

const STATES = {
  Alabama: ["AL", 32.8067, -86.7911],
  Alaska: ["AK", 61.3707, -152.4044],
  Arizona: ["AZ", 33.7298, -111.4312],
  Arkansas: ["AR", 34.9697, -92.3731],
  California: ["CA", 36.1162, -119.6816],
  Colorado: ["CO", 39.0598, -105.3111],
  Connecticut: ["CT", 41.5978, -72.7554],
  Delaware: ["DE", 39.3185, -75.5071],
  Florida: ["FL", 27.7663, -81.6868],
  Georgia: ["GA", 33.0406, -83.6431],
  Hawaii: ["HI", 21.0943, -157.4983],
  Idaho: ["ID", 44.2405, -114.4788],
  Illinois: ["IL", 40.3495, -88.9861],
  Indiana: ["IN", 39.8494, -86.2583],
  Iowa: ["IA", 42.0115, -93.2105],
  Kansas: ["KS", 38.5266, -96.7265],
  Kentucky: ["KY", 37.6681, -84.6701],
  Louisiana: ["LA", 31.1695, -91.8678],
  Maine: ["ME", 44.6939, -69.3819],
  Maryland: ["MD", 39.0639, -76.8021],
  Massachusetts: ["MA", 42.2302, -71.5301],
  Michigan: ["MI", 43.3266, -84.5361],
  Minnesota: ["MN", 45.6945, -93.9002],
  Mississippi: ["MS", 32.7416, -89.6787],
  Missouri: ["MO", 38.4561, -92.2884],
  Montana: ["MT", 46.9219, -110.4544],
  Nebraska: ["NE", 41.1254, -98.2681],
  Nevada: ["NV", 38.3135, -117.0554],
  "New Hampshire": ["NH", 43.4525, -71.5639],
  "New Jersey": ["NJ", 40.2989, -74.521],
  "New Mexico": ["NM", 34.8405, -106.2485],
  "New York": ["NY", 42.1657, -74.9481],
  "North Carolina": ["NC", 35.6301, -79.8064],
  "North Dakota": ["ND", 47.5289, -99.784],
  Ohio: ["OH", 40.3888, -82.7649],
  Oklahoma: ["OK", 35.5653, -96.9289],
  Oregon: ["OR", 44.572, -122.0709],
  Pennsylvania: ["PA", 40.5908, -77.2098],
  "Rhode Island": ["RI", 41.6809, -71.5118],
  "South Carolina": ["SC", 33.8569, -80.945],
  "South Dakota": ["SD", 44.2998, -99.4388],
  Tennessee: ["TN", 35.7478, -86.6923],
  Texas: ["TX", 31.0545, -97.5635],
  Utah: ["UT", 40.15, -111.8624],
  Vermont: ["VT", 44.0459, -72.7107],
  Virginia: ["VA", 37.7693, -78.17],
  Washington: ["WA", 47.4009, -121.4905],
  "West Virginia": ["WV", 38.4912, -80.9545],
  Wisconsin: ["WI", 44.2685, -89.6165],
  Wyoming: ["WY", 42.756, -107.3025],
  "District of Columbia": ["DC", 38.9072, -77.0369],
};

const stateByAbbreviation = new Map(
  Object.entries(STATES).map(([name, [abbr, lat, lon]]) => [
    abbr,
    { name, abbr, lat, lon },
  ]),
);

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.data)) return value.data;
  for (const key of ["entities", "events", "results", "items"]) {
    if (Array.isArray(value[key])) return value[key];
    if (Array.isArray(value.data?.[key])) return value.data[key];
  }
  return [];
}

function firstValue(object, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], object);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function stateForEntity(entity) {
  const attributes = entity.attrs ?? entity.attributes ?? {};
  const countryCode =
    attributes.country_code ?? attributes.countryCode ?? entity.country_code;
  if (countryCode && String(countryCode).toUpperCase() !== "US") return null;

  const rawName = String(
    firstValue(entity, ["name", "label", "displayName", "attrs.name"]) ?? "",
  )
    .replace(/,\s*United States$/i, "")
    .trim();
  const rawAbbreviation = String(
    firstValue(entity, [
      "attrs.iso_3166_2",
      "attrs.state_code",
      "attributes.iso_3166_2",
      "abbreviation",
    ]) ?? "",
  )
    .replace(/^US-/i, "")
    .toUpperCase();

  if (STATES[rawName]) {
    const [abbr, lat, lon] = STATES[rawName];
    return { name: rawName, abbr, lat, lon };
  }
  return stateByAbbreviation.get(rawAbbreviation) ?? null;
}

function entityCode(entity) {
  const value = firstValue(entity, [
    "code",
    "entityCode",
    "entity_code",
    "id",
    "attrs.code",
  ]);
  return value === undefined ? null : String(value);
}

function normalizeEntityCode(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);
  return text.includes("/") ? text.split("/").at(-1) : text;
}

function toDate(value, fallbackSeconds) {
  if (value === undefined || value === null || value === "") {
    return new Date(fallbackSeconds * 1000);
  }
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const numeric = Number(value);
    return new Date(numeric > 1e12 ? numeric : numeric * 1000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? new Date(fallbackSeconds * 1000)
    : parsed;
}

function severityFor(event, ended) {
  if (ended) return "recovering";
  const label = String(
    firstValue(event, ["severity", "level", "status", "classification"]) ?? "",
  ).toLowerCase();
  const score = Number(
    firstValue(event, ["score", "overall", "relevance", "magnitude"]) ?? 0,
  );
  if (
    label.includes("major") ||
    label.includes("critical") ||
    label.includes("high") ||
    score >= 1000
  ) {
    return "major";
  }
  return "moderate";
}

function collectEventRecords(value, inheritedCode, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectEventRecords(item, inheritedCode, output);
    return output;
  }

  const ownCode = firstValue(value, [
    "entityCode",
    "entity_code",
    "entity.code",
    "entity.id",
    "code",
    "location",
  ]);
  const nextCode =
    normalizeEntityCode(ownCode) ?? normalizeEntityCode(inheritedCode);
  const hasTime = firstValue(value, [
    "start",
    "startedAt",
    "start_ts",
    "start_time",
    "from",
    "time",
    "timestamp",
  ]);
  if (hasTime !== undefined && nextCode) {
    output.push({ event: value, code: nextCode });
    return output;
  }

  for (const key of ["data", "events", "results", "items", "alerts"]) {
    const child = value[key];
    if (child && typeof child === "object") {
      collectEventRecords(child, nextCode, output);
    }
  }
  return output;
}

async function fetchJson(path, parameters) {
  const url = new URL(path, API_ROOT);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "NetPulse snapshot builder (GitHub Pages prototype)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchEventEnvelopes(batch) {
  try {
    return [
      await fetchJson("outages/events", {
        entityType: "region",
        entityCode: batch.map((region) => region.code).join(","),
        from: fromSeconds,
        until: nowSeconds,
        overall: true,
        limit: 250,
      }),
    ];
  } catch (error) {
    if (batch.length === 1) {
      console.warn(
        `Skipping IODA region ${batch[0].code}: ${error.message}`,
      );
      return [];
    }
    const midpoint = Math.ceil(batch.length / 2);
    const halves = await Promise.all([
      fetchEventEnvelopes(batch.slice(0, midpoint)),
      fetchEventEnvelopes(batch.slice(midpoint)),
    ]);
    return halves.flat();
  }
}

async function main() {
  const entityEnvelope = await fetchJson("entities/query", {
    entityType: "region",
    relatedTo: "country/US",
    limit: 1000,
  });
  const regionEntities = asArray(entityEnvelope);
  const regions = regionEntities
    .map((entity) => {
      const code = entityCode(entity);
      const state = stateForEntity(entity);
      return code && state ? { code, state } : null;
    })
    .filter(Boolean);

  if (regions.length === 0) {
    throw new Error("IODA returned no mappable U.S. region entities");
  }

  const regionByCode = new Map(regions.map((region) => [region.code, region.state]));
  const batches = [];
  for (let index = 0; index < regions.length; index += 8) {
    batches.push(regions.slice(index, index + 8));
  }

  const envelopes = (await Promise.all(batches.map(fetchEventEnvelopes))).flat();

  const records = envelopes.flatMap((envelope) =>
    collectEventRecords(envelope, null),
  );
  const seen = new Set();
  const events = records
    .map(({ event, code }) => {
      const state = regionByCode.get(String(code));
      if (!state) return null;

      const startedAt = toDate(
        firstValue(event, [
          "startedAt",
          "start",
          "start_ts",
          "start_time",
          "from",
          "time",
          "timestamp",
        ]),
        fromSeconds,
      );
      const endedAtValue = firstValue(event, [
        "endedAt",
        "end",
        "end_ts",
        "end_time",
        "until",
      ]);
      const duration = Number(firstValue(event, ["duration", "durationSeconds"]));
      const endedAt = endedAtValue
        ? toDate(endedAtValue, nowSeconds)
        : Number.isFinite(duration) && duration > 0
          ? new Date(startedAt.getTime() + duration * 1000)
          : null;
      const ended = Boolean(endedAt && endedAt.getTime() < Date.now() - 15 * 60_000);
      const updatedAt = toDate(
        firstValue(event, ["updatedAt", "updated_at", "modified", "until"]),
        endedAt ? Math.floor(endedAt.getTime() / 1000) : nowSeconds,
      );
      const sourceId = String(
        firstValue(event, ["id", "eventId", "event_id", "uuid"]) ??
          `${code}-${startedAt.getTime()}`,
      );
      const id = `ioda-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      if (seen.has(id)) return null;
      seen.add(id);

      const severity = severityFor(event, ended);
      const until = Math.floor(
        (endedAt?.getTime() ?? Date.now()) / 1000,
      );
      return {
        id,
        kind: "internet",
        title:
          severity === "recovering"
            ? "Connectivity signal recovering"
            : severity === "major"
              ? "Major regional connectivity signal"
              : "Regional connectivity anomaly",
        region: state.name,
        state: state.abbr,
        name: `${state.name} regional centroid`,
        lat: state.lat,
        lon: state.lon,
        provider: "Multiple networks",
        network: "Regional internet edge",
        detectionSource: "IODA multi-signal analysis",
        severity,
        startedAt: startedAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        status: ended ? "Recovering" : "Monitoring",
        summary:
          "IODA detected a macroscopic connectivity event across regional measurements.",
        sourceUrl: `${IODA_SITE}region/${encodeURIComponent(code)}?from=${Math.floor(
          startedAt.getTime() / 1000,
        )}&until=${until}`,
        demo: false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);

  const snapshot = {
    metadata: {
      mode: "live",
      sourceName: "IODA — Georgia Tech Internet Intelligence Lab",
      sourceUrl: IODA_SITE,
      fetchedAt: new Date().toISOString(),
      note:
        events.length === 0
          ? "IODA returned no recent U.S. regional events for this build-time window."
          : "Generated at build time from recent U.S. regional IODA events.",
      copyright:
        "Source measurements and metadata: Georgia Institute of Technology IODA project.",
    },
    events,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${events.length} IODA event${events.length === 1 ? "" : "s"} to ${OUTPUT_PATH}`,
  );
}

main().catch(async (error) => {
  let fallbackMessage = "Checked-in demo snapshot remains in place.";
  try {
    const existing = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    if (!existing?.metadata || !Array.isArray(existing?.events)) {
      throw new Error("Existing snapshot is invalid");
    }
  } catch {
    const unavailableSnapshot = {
      metadata: {
        mode: "unavailable",
        sourceName: "IODA — Georgia Tech Internet Intelligence Lab",
        sourceUrl: IODA_SITE,
        fetchedAt: new Date().toISOString(),
        note: "The live snapshot could not be refreshed during this build.",
        copyright:
          "Source metadata: Georgia Institute of Technology IODA project.",
      },
      events: [],
    };
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(
      OUTPUT_PATH,
      `${JSON.stringify(unavailableSnapshot, null, 2)}\n`,
      "utf8",
    );
    fallbackMessage = "Wrote an explicit live-unavailable empty snapshot.";
  }

  console.warn(`IODA refresh skipped: ${error.message}`);
  console.warn(fallbackMessage);
  process.exitCode = 0;
});
