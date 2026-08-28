import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CENSUS_COUNTY_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/13/query";
const DEFAULT_OUTPUT_PATH = "public/data/nc-counties.geojson";

export async function fetchCountyBoundaries({ fetchImpl = fetch } = {}) {
  const url = new URL(CENSUS_COUNTY_URL);
  url.search = new URLSearchParams({
    where: "STATE='37'",
    outFields: "GEOID,NAME",
    returnGeometry: "true",
    f: "geojson",
    outSR: "4326",
    geometryPrecision: "4",
    maxAllowableOffset: "0.001",
  }).toString();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Census county boundaries returned HTTP ${response.status}`);
  const collection = await response.json();
  if (collection?.type !== "FeatureCollection" || collection.features?.length !== 100) throw new Error("Census county boundary schema");
  for (const feature of collection.features) {
    if (!/^37\d{3}$/.test(String(feature?.properties?.GEOID ?? "")) || !["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)) {
      throw new Error("Census county boundary schema");
    }
  }
  return collection;
}

export async function refreshCountyBoundaries({
  fetchImpl = fetch,
  outputPath = process.env.NETPULSE_NC_GEOGRAPHY_OUTPUT_PATH || DEFAULT_OUTPUT_PATH,
} = {}) {
  const collection = await fetchCountyBoundaries({ fetchImpl });
  await writeFile(outputPath, `${JSON.stringify(collection)}\n`, "utf8");
  return collection;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const collection = await refreshCountyBoundaries();
  console.log(`Wrote ${collection.features.length} Census county boundaries to ${process.env.NETPULSE_NC_GEOGRAPHY_OUTPUT_PATH || DEFAULT_OUTPUT_PATH}.`);
}
