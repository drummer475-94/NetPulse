export type ZipMatch = { fips: string; ambiguous?: boolean };

// Representative NC ZIP-to-county crosswalk. Ambiguous ZIPs select the most
// common county and prompt the resident to confirm with the county list.
const zipToCounty: Record<string, ZipMatch> = {
  "27215": { fips: "37001", ambiguous: true },
  "27514": { fips: "37135" },
  "27601": { fips: "37183" },
  "27701": { fips: "37063" },
  "28138": { fips: "37159" },
  "28202": { fips: "37119" },
  "28401": { fips: "37129" },
  "28607": { fips: "37189" },
  "28801": { fips: "37021" },
};

export function lookupNcZip(value: string): { status: "invalid" } | { status: "unsupported" } | ({ status: "matched" } & ZipMatch) {
  const zip = value.trim();
  if (!/^\d{5}$/.test(zip)) return { status: "invalid" };
  const match = zipToCounty[zip];
  return match ? { status: "matched", ...match } : { status: "unsupported" };
}

type Position = [number, number];
type PolygonCoordinates = Position[][];
type CountyGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: PolygonCoordinates[] };
export type CountyBoundaries = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: { GEOID?: unknown }; geometry: CountyGeometry }>;
};

function pointInRing(longitude: number, latitude: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(longitude: number, latitude: number, polygon: PolygonCoordinates) {
  return pointInRing(longitude, latitude, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));
}

export function countyFipsAt(longitude: number, latitude: number, boundaries: CountyBoundaries) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Array.isArray(boundaries?.features)) return undefined;
  for (const feature of boundaries.features) {
    const polygons = feature.geometry?.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry?.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    if (polygons.some((polygon) => pointInPolygon(longitude, latitude, polygon))) {
      const fips = String(feature.properties?.GEOID ?? "");
      if (/^37\d{3}$/.test(fips)) return fips;
    }
  }
  return undefined;
}
