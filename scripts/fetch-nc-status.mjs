import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NCEM_URL, NWS_URL, parseNcem, parseNws } from "../lib/nc-status.ts";

const DEFAULT_OUTPUT_PATH = "public/data/nc-status.json";
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchJson(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

export async function buildSnapshot({ fetchImpl = fetch, at = new Date() } = {}) {
  const generatedAt = at.toISOString();
  const [powerPayload, weatherPayload] = await Promise.all([
    fetchJson(fetchImpl, NCEM_URL),
    fetchJson(fetchImpl, NWS_URL, {
      Accept: "application/geo+json",
      "User-Agent": "NetPulse (https://github.com/drummer475-94/NetPulse)",
    }),
  ]);
  const power = parseNcem(powerPayload);
  const alerts = parseNws(weatherPayload);

  if (power.length === 0) throw new Error("NCEM returned no county records");

  const source = (name, sourceUrl) => ({
    name,
    sourceUrl,
    lastAttemptAt: generatedAt,
    lastSuccessAt: generatedAt,
    freshness: "fresh",
  });

  return {
    schemaVersion: 1,
    generatedAt,
    state: "NC",
    sources: {
      power: source("NC Emergency Management", NCEM_URL),
      weather: source("National Weather Service", NWS_URL),
    },
    power,
    alerts,
  };
}

export async function refreshSnapshot({
  fetchImpl = fetch,
  at = new Date(),
  outputPath = process.env.NETPULSE_NC_OUTPUT_PATH || DEFAULT_OUTPUT_PATH,
} = {}) {
  const snapshot = await buildSnapshot({ fetchImpl, at });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const snapshot = await refreshSnapshot();
  console.log(`Wrote ${snapshot.power.length} counties and ${snapshot.alerts.length} alerts to ${process.env.NETPULSE_NC_OUTPUT_PATH || DEFAULT_OUTPUT_PATH}.`);
}
