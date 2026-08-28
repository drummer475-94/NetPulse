import { ncCountyIdentities } from "../lib/nc-counties";

export type County = { fips: string; name: string; x: number; y: number };
export const counties: County[] = ncCountyIdentities.map(({ name, fips }, i) => ({ name, fips, x: 8 + (i % 10) * 9, y: 10 + Math.floor(i / 10) * 8.5 }));
// Representative local crosswalk entries. A ZIP resolving to more than one county is disclosed by the UI.
export const zipToCounty: Record<string, { fips: string; ambiguous?: boolean }> = { "27601": { fips: "37183" }, "28202": { fips: "37119" }, "27701": { fips: "37063" }, "27514": { fips: "37135" }, "28801": { fips: "37021" }, "28401": { fips: "37129" }, "28607": { fips: "37189" }, "27215": { fips: "37001", ambiguous: true } };
