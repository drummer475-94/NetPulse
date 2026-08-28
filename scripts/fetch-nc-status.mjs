import { writeFile } from "node:fs/promises";
const now = new Date().toISOString();
const unavailable = (name, sourceUrl) => ({ name, sourceUrl, lastAttemptAt: now, freshness: "unavailable" });
await writeFile("public/data/nc-status.json", JSON.stringify({ schemaVersion: 1, generatedAt: now, state: "NC", sources: { power: unavailable("NC Emergency Management", "https://spartagis.ncem.org/arcgis/rest/services/Public/ReadyNC_PowerOutages/MapServer"), weather: unavailable("National Weather Service", "https://api.weather.gov/alerts/active?area=NC") }, power: [], alerts: [] }, null, 2));
