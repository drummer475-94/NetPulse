import type { OutageEvent, OutageSeverity } from "./outage-data";

export type IodaState = {
  abbr: string;
  name: string;
  lat: number;
  lon: number;
  row: number;
  col: number;
};

export type SummaryUrlOptions = {
  fromSeconds: number;
  untilSeconds: number;
};

export type NormalizeSummaryOptions = {
  now?: Date | number | string;
  fromSeconds?: number;
  untilSeconds?: number;
};

export const IODA_API_ROOT: string;
export const IODA_SITE_URL: string;
export const SUMMARY_WINDOW_SECONDS: number;
export const MODERATE_OVERALL_SCORE_THRESHOLD: number;
export const MAJOR_OVERALL_SCORE_THRESHOLD: number;

export function buildSummaryUrl(options: SummaryUrlOptions): string;
export function matchState(name: unknown, code?: unknown): IodaState | null;
export function severityForSummary(values: {
  overall: number;
  eventCount: number;
}): OutageSeverity;
export function normalizeSummary(
  envelope: unknown,
  options?: NormalizeSummaryOptions,
): OutageEvent[];
