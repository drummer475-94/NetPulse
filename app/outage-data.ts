export type OutageKind = "internet" | "power";
export type OutageSeverity = "major" | "moderate" | "recovering";
export type SnapshotMode = "live" | "demo" | "unavailable";

export const SEVERITY_RANK: Record<OutageSeverity, number> = {
  major: 3,
  moderate: 2,
  recovering: 1,
};

export const SEVERITY_LABEL: Record<OutageSeverity, string> = {
  major: "Major",
  moderate: "Moderate",
  recovering: "Recovering",
};

export const STALE_AFTER_MINUTES = 15;

export type Coordinates = {
  lat: number;
  lon: number;
};

export type OutageEvent = {
  id: string;
  kind: OutageKind;
  title: string;
  region: string;
  state: string;
  name: string;
  lat: number;
  lon: number;
  provider: string;
  network: string;
  detectionSource: string;
  severity: OutageSeverity;
  startedAt?: string;
  updatedAt?: string;
  status: string;
  summary?: string;
  sourceUrl?: string;
  demo: boolean;
};

export type OutageSnapshot = {
  metadata: {
    mode: SnapshotMode;
    sourceName: string;
    sourceUrl: string;
    fetchedAt: string;
    note: string;
    copyright: string;
  };
  events: OutageEvent[];
};

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath =
  configuredBasePath === "/" ? "" : configuredBasePath.replace(/\/$/, "");

export const OUTAGE_DATA_PATH = `${basePath}/data/outages.json`;

export const FALLBACK_SNAPSHOT: OutageSnapshot = {
  metadata: {
    mode: "demo",
    sourceName: "NetPulse fictional demonstration dataset",
    sourceUrl: "https://ioda.inetintel.cc.gatech.edu/",
    fetchedAt: "2026-07-29T21:30:00.000Z",
    note: "Fictional regional examples are included to demonstrate the interface.",
    copyright: "No IODA measurements are reproduced in demo mode.",
  },
  events: [
    {
      id: "demo-mid-missouri",
      kind: "internet",
      title: "Regional connectivity drop",
      region: "Mid-Missouri",
      state: "MO",
      name: "Columbia area",
      lat: 38.9517,
      lon: -92.3341,
      provider: "Multiple regional networks",
      network: "Regional edge networks",
      detectionSource: "Fictional multi-signal example",
      severity: "major",
      startedAt: "2026-07-29T20:54:00.000Z",
      updatedAt: "2026-07-29T21:26:00.000Z",
      status: "Ongoing",
      summary:
        "A fictional sharp decline across multiple connectivity measurements.",
      demo: true,
    },
    {
      id: "demo-eastern-nebraska",
      kind: "internet",
      title: "Elevated network disruption",
      region: "Eastern Nebraska",
      state: "NE",
      name: "Omaha metro",
      lat: 41.2565,
      lon: -95.9345,
      provider: "Multiple regional networks",
      network: "Regional access networks",
      detectionSource: "Fictional multi-signal example",
      severity: "moderate",
      startedAt: "2026-07-29T19:42:00.000Z",
      updatedAt: "2026-07-29T21:18:00.000Z",
      status: "Monitoring",
      summary:
        "A fictional, sustained anomaly affecting a portion of the metro area.",
      demo: true,
    },
    {
      id: "demo-northwest-arkansas",
      kind: "internet",
      title: "Connectivity returning",
      region: "Northwest Arkansas",
      state: "AR",
      name: "Fayetteville area",
      lat: 36.0822,
      lon: -94.1719,
      provider: "Multiple regional networks",
      network: "Regional edge networks",
      detectionSource: "Fictional multi-signal example",
      severity: "recovering",
      startedAt: "2026-07-29T17:10:00.000Z",
      updatedAt: "2026-07-29T21:06:00.000Z",
      status: "Recovering",
      summary:
        "A fictional signal showing measurements trending toward their baseline.",
      demo: true,
    },
    {
      id: "demo-north-texas",
      kind: "internet",
      title: "Broadband reachability anomaly",
      region: "North Texas",
      state: "TX",
      name: "Dallas–Fort Worth",
      lat: 32.7767,
      lon: -96.797,
      provider: "Multiple regional networks",
      network: "Regional broadband networks",
      detectionSource: "Fictional multi-signal example",
      severity: "major",
      startedAt: "2026-07-29T20:08:00.000Z",
      updatedAt: "2026-07-29T21:20:00.000Z",
      status: "Ongoing",
      summary:
        "A fictional event used to preview a major metro connectivity signal.",
      demo: true,
    },
    {
      id: "demo-front-range",
      kind: "internet",
      title: "Regional route instability",
      region: "Colorado Front Range",
      state: "CO",
      name: "Denver area",
      lat: 39.7392,
      lon: -104.9903,
      provider: "Multiple regional networks",
      network: "Regional routing networks",
      detectionSource: "Fictional multi-signal example",
      severity: "moderate",
      startedAt: "2026-07-29T20:16:00.000Z",
      updatedAt: "2026-07-29T21:11:00.000Z",
      status: "Monitoring",
      summary:
        "A fictional routing anomaly across a representative regional centroid.",
      demo: true,
    },
    {
      id: "demo-central-tennessee",
      kind: "internet",
      title: "Access network disruption",
      region: "Central Tennessee",
      state: "TN",
      name: "Nashville area",
      lat: 36.1627,
      lon: -86.7816,
      provider: "Multiple regional networks",
      network: "Regional access networks",
      detectionSource: "Fictional multi-signal example",
      severity: "recovering",
      startedAt: "2026-07-29T18:21:00.000Z",
      updatedAt: "2026-07-29T21:03:00.000Z",
      status: "Recovering",
      summary:
        "A fictional event showing improving reachability after a broad decline.",
      demo: true,
    },
  ],
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineMiles(a: Coordinates, b: Coordinates) {
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lon - a.lon);
  const startLatitude = toRadians(a.lat);
  const endLatitude = toRadians(b.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    earthRadiusMiles *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function bearingDegrees(a: Coordinates, b: Coordinates) {
  const startLatitude = toRadians(a.lat);
  const endLatitude = toRadians(b.lat);
  const longitudeDelta = toRadians(b.lon - a.lon);
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) *
      Math.cos(endLatitude) *
      Math.cos(longitudeDelta);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function bearingLabel(bearing: number) {
  const directions = [
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
  ];
  return directions[Math.round(bearing / 45) % directions.length];
}

export function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

export function minutesSince(value: string, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - timestamp) / 60_000));
}

export function formatAge(value: string, now = Date.now()) {
  const minutes = minutesSince(value, now);
  if (!Number.isFinite(minutes)) return "age unavailable";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(startedAt: string, endedAt: string) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return "duration unavailable";
  }
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}
