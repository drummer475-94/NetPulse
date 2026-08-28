export type Freshness = "fresh" | "stale" | "unavailable";

export type SourceStatus = {
  name: string; sourceUrl: string; lastAttemptAt: string; lastSuccessAt?: string;
  observedAt?: string; freshness: Freshness; failureCategory?: string;
};
export type CountyPowerStatus = { countyFips: string; countyName: string; customersOut: number; customersServed?: number; percentOut?: number; estimatedRestoration?: string };
export type WeatherAlert = { id: string; event: string; headline: string; severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown"; urgency: string; certainty: string; status: string; sentAt: string; effectiveAt?: string; onsetAt?: string; expiresAt: string; endsAt?: string; areaDescription: string; countyFips: string[]; description?: string; instruction?: string; geometry?: unknown; senderName: string; sourceUrl: string };
export type NcStatusSnapshotV1 = { schemaVersion: 1; generatedAt: string; state: "NC"; sources: { power: SourceStatus; weather: SourceStatus }; power: CountyPowerStatus[]; alerts: WeatherAlert[] };

export const NWS_URL = "https://api.weather.gov/alerts/active?area=NC";
export const NCEM_URL = "https://spartagis.ncem.org/arcgis/rest/services/Public/ReadyNC_PowerOutages/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json";
const now = () => new Date().toISOString();
export function unavailableSnapshot(at = now()): NcStatusSnapshotV1 {
  const unavailable = (name: string, sourceUrl: string): SourceStatus => ({ name, sourceUrl, lastAttemptAt: at, freshness: "unavailable" });
  return { schemaVersion: 1, generatedAt: at, state: "NC", sources: { power: unavailable("NC Emergency Management", NCEM_URL), weather: unavailable("National Weather Service", NWS_URL) }, power: [], alerts: [] };
}
function iso(value: unknown) { const date = new Date(String(value ?? "")); return Number.isNaN(date.valueOf()) ? undefined : date.toISOString(); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function num(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined; }
export function parseNws(input: unknown): WeatherAlert[] {
  const features = (input as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error("weather-schema");
  const alerts = features.map((feature) => {
    const properties = (feature as { properties?: Record<string, unknown> }).properties;
    if (!properties) throw new Error("weather-schema");
    const id = text(properties.id) || text((feature as { id?: unknown }).id);
    const event = text(properties.event), expiresAt = iso(properties.expires);
    if (!id || !event || !expiresAt) throw new Error("weather-schema");
    const codes = Array.isArray(properties.geocode?.SAME) ? properties.geocode.SAME.filter((x): x is string => /^37\d{3}$/.test(String(x))).map(String) : [];
    const severity = ["Extreme", "Severe", "Moderate", "Minor"].includes(text(properties.severity)) ? text(properties.severity) as WeatherAlert["severity"] : "Unknown";
    return { id, event, headline: text(properties.headline) || event, severity, urgency: text(properties.urgency) || "Unknown", certainty: text(properties.certainty) || "Unknown", status: text(properties.status) || "Actual", sentAt: iso(properties.sent) || expiresAt, effectiveAt: iso(properties.effective), onsetAt: iso(properties.onset), expiresAt, endsAt: iso(properties.ends), areaDescription: text(properties.areaDesc) || "North Carolina", countyFips: codes, description: text(properties.description) || undefined, instruction: text(properties.instruction) || undefined, geometry: ((feature as { geometry?: unknown }).geometry ?? null), senderName: text(properties.senderName) || "National Weather Service", sourceUrl: text(properties['@id']) || `https://api.weather.gov/alerts/${id}` };
  });
  return alerts.filter((a) => a.status !== "Cancel" && Date.parse(a.expiresAt) > Date.now());
}
export function parseNcem(input: unknown): CountyPowerStatus[] {
  const features = (input as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error("power-schema");
  return features.map((feature) => {
    const a = (feature as { attributes?: Record<string, unknown> }).attributes;
    if (!a) throw new Error("power-schema");
    const countyFips = String(a.fips ?? a.FIPS ?? a.county_fips ?? "").padStart(5, "0");
    const countyName = text(a.name ?? a.NAME ?? a.county ?? a.COUNTY);
    const customersOut = num(a.customers_out ?? a.CUSTOMERS_OUT ?? a.outages);
    if (!/^37\d{3}$/.test(countyFips) || !countyName || customersOut === undefined) throw new Error("power-schema");
    const customersServed = num(a.total_customers ?? a.TOTAL_CUSTOMERS ?? a.customers_served);
    const percentOut = num(a.perc_out ?? a.PERC_OUT ?? a.percent_out) ?? (customersServed ? customersOut / customersServed * 100 : undefined);
    return { countyFips, countyName, customersOut, customersServed, percentOut };
  });
}
export function isSnapshot(value: unknown): value is NcStatusSnapshotV1 { const v = value as NcStatusSnapshotV1; return v?.schemaVersion === 1 && v.state === "NC" && Array.isArray(v.power) && Array.isArray(v.alerts) && !!v.sources?.power && !!v.sources?.weather; }
