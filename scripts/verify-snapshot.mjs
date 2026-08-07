import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SNAPSHOT_PATH = resolve(
  fileURLToPath(new URL("../public/data/outages.json", import.meta.url)),
);
const SNAPSHOT_PATH = process.argv[2]
  ? resolve(process.argv[2])
  : process.env.NETPULSE_OUTAGE_OUTPUT_PATH
    ? resolve(process.env.NETPULSE_OUTAGE_OUTPUT_PATH)
    : DEFAULT_SNAPSHOT_PATH;

const MODES = new Set(["live", "demo", "unavailable"]);
const KINDS = new Set(["internet", "power"]);
const SEVERITIES = new Set(["major", "moderate", "recovering"]);
const REQUIRED_METADATA_FIELDS = [
  "mode",
  "sourceName",
  "sourceUrl",
  "fetchedAt",
  "note",
  "copyright",
];
const REQUIRED_EVENT_STRING_FIELDS = [
  "id",
  "title",
  "region",
  "state",
  "name",
  "provider",
  "network",
  "detectionSource",
  "startedAt",
  "updatedAt",
  "status",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isUsCoordinate(lat, lon) {
  // Includes the 50 states, DC, Alaska, and Hawaii while excluding overseas values.
  return lat >= 18 && lat <= 72 && lon >= -180 && lon <= -64;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateSnapshot(snapshot) {
  const errors = [];
  const warnings = [];
  if (!isObject(snapshot)) {
    return { errors: ["Snapshot must be a JSON object."], warnings };
  }
  if (!isObject(snapshot.metadata)) {
    errors.push("Snapshot metadata must be an object.");
  }
  if (!Array.isArray(snapshot.events)) {
    errors.push("Snapshot events must be an array.");
  }
  if (errors.length > 0) return { errors, warnings };

  const { metadata, events } = snapshot;
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!isNonEmptyString(metadata[field])) {
      errors.push(`metadata.${field} must be a non-empty string.`);
    }
  }
  if (isNonEmptyString(metadata.mode) && !MODES.has(metadata.mode)) {
    errors.push(`metadata.mode must be one of: ${[...MODES].join(", ")}.`);
  }
  if (isNonEmptyString(metadata.fetchedAt) && !isValidDate(metadata.fetchedAt)) {
    errors.push("metadata.fetchedAt must be an ISO-compatible date.");
  }
  if (isNonEmptyString(metadata.sourceUrl) && !isHttpUrl(metadata.sourceUrl)) {
    errors.push("metadata.sourceUrl must be an http(s) URL.");
  }

  if (metadata.mode === "unavailable" && events.length !== 0) {
    errors.push("An unavailable snapshot must not contain events.");
  }
  if (metadata.mode === "live" && events.length === 0) {
    warnings.push("Live snapshot contains zero events; this is valid for a quiet window.");
  }

  const seenIds = new Set();
  for (const [index, event] of events.entries()) {
    const prefix = `events[${index}]`;
    if (!isObject(event)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    for (const field of REQUIRED_EVENT_STRING_FIELDS) {
      if (!isNonEmptyString(event[field])) {
        errors.push(`${prefix}.${field} must be a non-empty string.`);
      }
    }
    if (isNonEmptyString(event.id)) {
      if (seenIds.has(event.id)) errors.push(`${prefix}.id duplicates an earlier event id.`);
      seenIds.add(event.id);
    }
    if (!KINDS.has(event.kind)) errors.push(`${prefix}.kind must be "internet" or "power".`);
    if (!SEVERITIES.has(event.severity)) {
      errors.push(`${prefix}.severity must be one of: ${[...SEVERITIES].join(", ")}.`);
    }
    if (!/^[A-Z]{2}$/.test(event.state ?? "")) {
      errors.push(`${prefix}.state must be a two-letter uppercase U.S. abbreviation.`);
    }
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) {
      errors.push(`${prefix}.lat and ${prefix}.lon must be finite numbers.`);
    } else if (!isUsCoordinate(event.lat, event.lon)) {
      errors.push(`${prefix} coordinates are outside the supported U.S. coverage area.`);
    }
    if (!isValidDate(event.startedAt)) errors.push(`${prefix}.startedAt must be a valid date.`);
    if (!isValidDate(event.updatedAt)) errors.push(`${prefix}.updatedAt must be a valid date.`);
    if (isValidDate(event.startedAt) && isValidDate(event.updatedAt) && Date.parse(event.updatedAt) < Date.parse(event.startedAt)) {
      errors.push(`${prefix}.updatedAt cannot be earlier than startedAt.`);
    }
    if (typeof event.demo !== "boolean") errors.push(`${prefix}.demo must be boolean.`);
    if (event.sourceUrl !== undefined && !isHttpUrl(event.sourceUrl)) {
      errors.push(`${prefix}.sourceUrl must be an http(s) URL when provided.`);
    }
    if (metadata.mode === "live" && event.demo !== false) {
      errors.push(`${prefix} is mislabeled: live snapshots cannot contain demo events.`);
    }
    if (metadata.mode === "demo" && event.demo !== true) {
      errors.push(`${prefix} is mislabeled: demo snapshots must mark every event as demo.`);
    }
  }
  return { errors, warnings };
}

async function writeSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
  }
  console.log(markdown);
}

async function main() {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  } catch (error) {
    await writeSummary(`# NetPulse snapshot validation\n\n- File: \`${SNAPSHOT_PATH}\`\n- Result: **failed**\n- Error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { errors, warnings } = validateSnapshot(snapshot);
  const lines = [
    "# NetPulse snapshot validation",
    "",
    `- File: \`${SNAPSHOT_PATH}\``,
    `- Mode: \`${snapshot.metadata?.mode ?? "unknown"}\``,
    `- Events: **${Array.isArray(snapshot.events) ? snapshot.events.length : "invalid"}**`,
    `- Result: **${errors.length === 0 ? "valid" : "failed"}**`,
  ];
  if (warnings.length > 0) {
    lines.push("", "## Warnings", "", ...warnings.map((warning) => `- ${warning}`));
  }
  if (errors.length > 0) {
    lines.push("", "## Errors", "", ...errors.map((error) => `- ${error}`));
  }
  await writeSummary(lines.join("\n"));
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Snapshot validation failed unexpectedly: ${error.message}`);
  process.exitCode = 1;
});

export { validateSnapshot };
