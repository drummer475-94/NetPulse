import { ncCountyByName, ncCountyIdentities } from "./nc-counties.ts";

export type Freshness = "fresh" | "stale" | "unavailable";

export type SourceStatus = {
  name: string; sourceUrl: string; lastAttemptAt: string; lastSuccessAt?: string;
  observedAt?: string; freshness: Freshness; failureCategory?: string;
};
export type CountyPowerStatus = { countyFips: string; countyName: string; customersOut: number; customersServed?: number; percentOut?: number; estimatedRestoration?: string };
export type WeatherAlert = { id: string; event: string; headline: string; severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown"; urgency: string; certainty: string; status: string; sentAt: string; effectiveAt?: string; onsetAt?: string; expiresAt: string; endsAt?: string; areaDescription: string; countyFips: string[]; description?: string; instruction?: string; geometry?: unknown; senderName: string; sourceUrl: string };
export type NcStatusSnapshotV1 = { schemaVersion: 1; generatedAt: string; state: "NC"; sources: { power: SourceStatus; weather: SourceStatus }; power: CountyPowerStatus[]; alerts: WeatherAlert[] };

export const NWS_URL = "https://api.weather.gov/alerts/active?area=NC";
export const NCEM_URL = "https://fusion.ncsparta.gov/ReadyNC_PowerOutageAPI/html";
const now = () => new Date().toISOString();
export function unavailableSnapshot(at = now()): NcStatusSnapshotV1 {
  const unavailable = (name: string, sourceUrl: string): SourceStatus => ({ name, sourceUrl, lastAttemptAt: at, freshness: "unavailable" });
  return { schemaVersion: 1, generatedAt: at, state: "NC", sources: { power: unavailable("NC Emergency Management", NCEM_URL), weather: unavailable("National Weather Service", NWS_URL) }, power: [], alerts: [] };
}
function iso(value: unknown) { const date = new Date(String(value ?? "")); return Number.isNaN(date.valueOf()) ? undefined : date.toISOString(); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function num(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined; }
function normalizeCountyName(value: unknown) { return text(value).replace(/\s+COUNTY$/i, "").replace(/\s+/g, " ").toUpperCase(); }
function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}
function htmlText(value: string) { return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function outageCount(value: string) {
  const normalized = htmlText(value).replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
function parseNcemHtml(input: string): CountyPowerStatus[] {
  const counts = new Map<string, number>();
  let sawHeader = false;
  let statewideTotal: number | undefined;

  for (const rowMatch of input.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (match) => htmlText(match[1]));
    if (cells.length < 2) continue;

    const label = cells[0];
    const labelKey = normalizeCountyName(label);
    if (labelKey === "COUNTY") {
      sawHeader = true;
      continue;
    }
    if (/^STATEWIDE OUTAGES$/i.test(label)) {
      statewideTotal = outageCount(cells[1]);
      if (statewideTotal === undefined) throw new Error("power-schema");
      continue;
    }

    const county = ncCountyByName.get(labelKey);
    if (!county) continue;
    const customersOut = outageCount(cells[1]);
    if (customersOut === undefined || counts.has(county.fips)) throw new Error("power-schema");
    counts.set(county.fips, customersOut);
  }

  if (!sawHeader || statewideTotal === undefined) throw new Error("power-schema");
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (total !== statewideTotal) throw new Error("power-schema");

  return ncCountyIdentities.map((county) => ({
    countyFips: county.fips,
    countyName: county.name,
    customersOut: counts.get(county.fips) ?? 0,
  }));
}
export function parseNws(input: unknown): WeatherAlert[] {
  const features = (input as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error("weather-schema");
  const alerts = features.map((feature) => {
    const properties = (feature as { properties?: Record<string, unknown> }).properties;
    if (!properties) throw new Error("weather-schema");
    const id = text(properties.id) || text((feature as { id?: unknown }).id);
    const event = text(properties.event), expiresAt = iso(properties.expires);
    if (!id || !event || !expiresAt) throw new Error("weather-schema");
    const sameCodes = (properties.geocode as { SAME?: unknown } | undefined)?.SAME;
    const codes = Array.isArray(sameCodes) ? sameCodes.map(String).map((code) => /^037\d{3}$/.test(code) ? code.slice(1) : code).filter((code) => /^37\d{3}$/.test(code)) : [];
    const severity = ["Extreme", "Severe", "Moderate", "Minor"].includes(text(properties.severity)) ? text(properties.severity) as WeatherAlert["severity"] : "Unknown";
    return { id, event, headline: text(properties.headline) || event, severity, urgency: text(properties.urgency) || "Unknown", certainty: text(properties.certainty) || "Unknown", status: text(properties.status) || "Actual", sentAt: iso(properties.sent) || expiresAt, effectiveAt: iso(properties.effective), onsetAt: iso(properties.onset), expiresAt, endsAt: iso(properties.ends), areaDescription: text(properties.areaDesc) || "North Carolina", countyFips: codes, description: text(properties.description) || undefined, instruction: text(properties.instruction) || undefined, geometry: ((feature as { geometry?: unknown }).geometry ?? null), senderName: text(properties.senderName) || "National Weather Service", sourceUrl: text(properties['@id']) || `https://api.weather.gov/alerts/${id}` };
  });
  return alerts.filter((a) => a.status !== "Cancel" && Date.parse(a.expiresAt) > Date.now());
}
export function parseNcem(input: unknown): CountyPowerStatus[] {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try { return parseNcem(JSON.parse(trimmed)); } catch { throw new Error("power-schema"); }
    }
    return parseNcemHtml(input);
  }

  const features = (input as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error("power-schema");
  return features.map((feature) => {
    const a = (feature as { attributes?: Record<string, unknown> }).attributes;
    if (!a) throw new Error("power-schema");
    const suppliedCountyName = text(a.CountyName ?? a.name ?? a.NAME ?? a.county ?? a.COUNTY);
    const countyIdentity = ncCountyByName.get(suppliedCountyName.toUpperCase());
    const countyName = countyIdentity?.name ?? suppliedCountyName;
    const suppliedFips = String(a.fips ?? a.FIPS ?? a.county_fips ?? "");
    const countyFips = suppliedFips ? suppliedFips.padStart(5, "0") : countyIdentity?.fips ?? "";
    const customersOut = num(a.Outages ?? a.customers_out ?? a.CUSTOMERS_OUT ?? a.outages);
    if (!/^37\d{3}$/.test(countyFips) || !countyName || customersOut === undefined) throw new Error("power-schema");
    const customersServed = num(a.total_customers ?? a.TOTAL_CUSTOMERS ?? a.customers_served);
    const percentOut = num(a.perc_out ?? a.PERC_OUT ?? a.percent_out) ?? (customersServed ? customersOut / customersServed * 100 : undefined);
    return { countyFips, countyName, customersOut, customersServed, percentOut };
  });
}
export function isSnapshot(value: unknown): value is NcStatusSnapshotV1 { const v = value as NcStatusSnapshotV1; return v?.schemaVersion === 1 && v.state === "NC" && Array.isArray(v.power) && Array.isArray(v.alerts) && !!v.sources?.power && !!v.sources?.weather; }
