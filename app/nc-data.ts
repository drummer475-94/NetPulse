import { ncCountyIdentities } from "../lib/nc-counties";

export type County = { fips: string; name: string; x: number; y: number };
export const counties: County[] = ncCountyIdentities.map(({ name, fips }, i) => ({ name, fips, x: 8 + (i % 10) * 9, y: 10 + Math.floor(i / 10) * 8.5 }));
