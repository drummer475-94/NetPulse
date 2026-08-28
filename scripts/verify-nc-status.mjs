import { readFile } from "node:fs/promises";
import { isSnapshot } from "../lib/nc-status.ts";

const path = process.env.NETPULSE_NC_OUTPUT_PATH || "public/data/nc-status.json";
const snapshot = JSON.parse(await readFile(path, "utf8"));

if (!isSnapshot(snapshot)) throw new Error(`${path} is not a valid NC status snapshot`);
if (snapshot.sources.power.freshness !== "fresh" || snapshot.sources.weather.freshness !== "fresh") {
  throw new Error(`${path} contains an unavailable or stale source`);
}
if (!snapshot.sources.power.lastSuccessAt || !snapshot.sources.weather.lastSuccessAt) {
  throw new Error(`${path} is missing source success timestamps`);
}
if (snapshot.power.length === 0) throw new Error(`${path} contains no NC power records`);

console.log(`Verified ${snapshot.power.length} counties and ${snapshot.alerts.length} active alerts in ${path}.`);
