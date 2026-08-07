import { appendFile } from "node:fs/promises";

const API_ROOT = "https://api.ioda.inetintel.cc.gatech.edu/v2/";
const ZIPPO_ROOT = "https://api.zippopotam.us/";
const REQUEST_TIMEOUT_MS = 20_000;
const HOUR = 60 * 60;
const nowSeconds = Math.floor(Date.now() / 1000);
const fromSeconds = nowSeconds - 24 * HOUR;

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.data)) return value.data;
  for (const key of ["entities", "events", "results", "items"]) {
    if (Array.isArray(value[key])) return value[key];
    if (Array.isArray(value.data?.[key])) return value.data[key];
  }
  return [];
}

function describe(value, depth = 0) {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.length > 0 && depth < 2 ? describe(value[0], depth + 1) : undefined,
    };
  }
  if (typeof value !== "object") return typeof value;

  const keys = Object.keys(value).sort();
  const fields = {};
  if (depth < 2) {
    for (const key of keys.slice(0, 30)) {
      fields[key] = describe(value[key], depth + 1);
    }
  }
  return { type: "object", keys, fields };
}

function compactEntity(entity) {
  if (!entity || typeof entity !== "object") return entity;
  return {
    id: entity.id ?? null,
    code: entity.code ?? null,
    name: entity.name ?? null,
    type: entity.type ?? null,
    subnames: entity.subnames ?? null,
    attrs: entity.attrs ?? null,
  };
}

function compactResponse(result) {
  return {
    url: result.url,
    status: result.status,
    ok: result.ok,
    contentType: result.contentType,
    corsAllowOrigin: result.corsAllowOrigin,
    shape: result.body === undefined ? null : describe(result.body),
  };
}

async function requestJson(url, label) {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "NetPulse IODA probe" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let body;
    let parseError;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        parseError = `Response was not JSON (${text.slice(0, 240)})`;
      }
    }

    return {
      label,
      url: response.url,
      status: response.status,
      ok: response.ok,
      contentType,
      corsAllowOrigin: response.headers.get("access-control-allow-origin"),
      body,
      parseError,
    };
  } catch (error) {
    return {
      label,
      url: String(url),
      status: "network error",
      ok: false,
      contentType: "",
      corsAllowOrigin: null,
      body: undefined,
      parseError: error.message,
    };
  }
}

function buildIodaUrl(path, parameters) {
  const url = new URL(path, API_ROOT);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function markdownCode(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function sectionFor(result) {
  const lines = [`## ${result.label}`, ""];
  lines.push(`- URL: \`${result.url}\``);
  lines.push(`- HTTP status: **${result.status}**${result.ok ? "" : " (request failed)"}`);
  lines.push(`- Content-Type: \`${result.contentType || "not provided"}\``);
  lines.push(`- Access-Control-Allow-Origin: \`${result.corsAllowOrigin ?? "not provided"}\``);
  if (result.parseError) lines.push(`- Parse warning: ${result.parseError}`);
  lines.push("", "Response shape:", "", markdownCode(compactResponse(result)), "");
  return lines.join("\n");
}

async function writeSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await appendFile(summaryPath, `${markdown}\n`, "utf8");
  }
  console.log(markdown);
}

async function main() {
  const startedAt = new Date().toISOString();
  const results = [];
  const entitiesUrl = buildIodaUrl("entities/query", {
    entityType: "region",
    relatedTo: "country/US",
    limit: 1000,
  });
  const entitiesResult = await requestJson(entitiesUrl, "IODA U.S. region entities");
  results.push(entitiesResult);

  const summaryUrl = buildIodaUrl("outages/summary", {
    entityType: "region",
    relatedTo: "country/US",
    from: fromSeconds,
    until: nowSeconds,
  });
  const summaryResult = await requestJson(summaryUrl, "IODA U.S. regional outage summary");
  results.push(summaryResult);

  const regions = asArray(entitiesResult.body);
  const probeEntity = regions.find((entity) => entity?.code ?? entity?.id);
  const firstCode = probeEntity?.code ?? probeEntity?.id;
  let eventsResult;
  if (firstCode) {
    const eventsUrl = buildIodaUrl("outages/events", {
      entityType: "region",
      entityCode: firstCode,
      from: fromSeconds,
      until: nowSeconds,
      overall: true,
      limit: 25,
    });
    eventsResult = await requestJson(eventsUrl, "IODA regional outage events (one probe region)");
    results.push(eventsResult);
  }

  const zippoResult = await requestJson(new URL("us/90210", ZIPPO_ROOT), "Zippopotam.us ZIP lookup and CORS");
  results.push(zippoResult);

  const entityList = regions.map(compactEntity);
  const header = [
    "# NetPulse upstream data probe",
    "",
    `Captured: ${startedAt}`,
    "",
    `IODA window: unix seconds ${fromSeconds} through ${nowSeconds} (last 24 hours).`,
    "",
    "This probe records upstream response shapes without treating a successful events endpoint as an assumption.",
    "",
  ].join("\n");
  const entitySection = [
    "## Mappable region source list",
    "",
    `Returned entity records: **${regions.length}**`,
    "",
    markdownCode(entityList),
    "",
  ].join("\n");
  await writeSummary(`${header}${results.map(sectionFor).join("\n")}${entitySection}`);

  const requiredFailures = [entitiesResult, summaryResult].filter(
    (result) => !result.ok || result.body === undefined,
  );
  if (requiredFailures.length > 0) {
    throw new Error(
      `Required IODA probe request failed: ${requiredFailures.map((result) => result.label).join(", ")}`,
    );
  }
  if (!firstCode) {
    throw new Error("IODA returned no U.S. region code to test the regional events endpoint");
  }
}

main().catch((error) => {
  console.error(`IODA probe failed: ${error.message}`);
  process.exitCode = 1;
});
