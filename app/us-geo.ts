import rawStates from "./us-states.json";

export type StateAbbr = string;

export type UsState = {
  abbr: StateAbbr;
  name: string;
  lat: number;
  lon: number;
  row: number;
  col: number;
};

type ZipRange = readonly [start: number, end: number, state: StateAbbr];

/** The 50 states plus the District of Columbia, used throughout the UI and data layer. */
export const US_STATES: readonly UsState[] = rawStates;

export const US_STATES_BY_ABBR: ReadonlyMap<StateAbbr, UsState> = new Map(
  US_STATES.map((state) => [state.abbr, state]),
);

const ZIP_RANGES: readonly ZipRange[] = [
  [5, 5, "NY"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"],
  [39, 49, "ME"], [50, 54, "VT"], [55, 55, "MA"], [56, 59, "VT"],
  [60, 69, "CT"], [70, 89, "NJ"], [90, 99, "NY"], [100, 149, "NY"],
  [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"],
  [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"],
  [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
  [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"],
  [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"],
  [550, 567, "MN"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"],
  [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"],
  [700, 715, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"],
  [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"],
  [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"],
  [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"],
  [995, 999, "AK"],
];

function zipNumber(zip: string | number): number | undefined {
  const value = typeof zip === "number" ? String(Math.trunc(zip)).padStart(5, "0") : zip.trim();
  const match = /^(\d{5})(?:-\d{4})?$/.exec(value);
  return match ? Number(match[1].slice(0, 3)) : undefined;
}

/**
 * Maps a US ZIP code to its state through USPS ZIP-prefix ranges. This is a
 * fallback for location lookup, so ZIPs outside the 50 states/DC return undefined.
 */
export function stateForZip(zip: string | number): UsState | undefined {
  const prefix = zipNumber(zip);
  if (prefix === undefined) return undefined;

  const match = ZIP_RANGES.find(([start, end]) => prefix >= start && prefix <= end);
  return match ? US_STATES_BY_ABBR.get(match[2]) : undefined;
}

/** Returns the closest state centroid to a latitude/longitude pair. */
export function nearestState(lat: number, lon: number): UsState | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return undefined;
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = toRadians(lat);
  const longitude = toRadians(lon);
  let closest: UsState | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const state of US_STATES) {
    const stateLatitude = toRadians(state.lat);
    const deltaLatitude = stateLatitude - latitude;
    const deltaLongitude = toRadians(state.lon) - longitude;
    const haversine =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(latitude) * Math.cos(stateLatitude) * Math.sin(deltaLongitude / 2) ** 2;
    const distance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    if (distance < closestDistance) {
      closest = state;
      closestDistance = distance;
    }
  }

  return closest;
}
