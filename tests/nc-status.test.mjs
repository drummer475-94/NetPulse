import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildSnapshot, refreshSnapshot } from "../scripts/fetch-nc-status.mjs";

const powerPayload = {
  features: [{ attributes: { CountyName: "WAKE", Outages: 12 } }],
};
const weatherPayload = {
  features: [{
    id: "https://api.weather.gov/alerts/test-alert",
    properties: {
      event: "Test Warning",
      headline: "Test warning headline",
      severity: "Severe",
      expires: "2099-01-01T00:00:00Z",
      geocode: { SAME: ["037183"] },
    },
  }],
};

function mockFetch(responses) {
  return async (url, options) => {
    const payload = responses.find(([needle]) => String(url).includes(needle))?.[1];
    assert.ok(payload, `Unexpected request: ${url}`);
    if (String(url).includes("api.weather.gov")) {
      assert.equal(options.headers.Accept, "application/geo+json");
      assert.match(options.headers["User-Agent"], /NetPulse/);
    }
    return { ok: true, status: 200, json: async () => payload };
  };
}

test("build-time refresh creates a fresh snapshot from both official feeds", async () => {
  const at = new Date("2026-08-28T22:00:00Z");
  const snapshot = await buildSnapshot({
    at,
    fetchImpl: mockFetch([["spartagis.ncem.org", powerPayload], ["api.weather.gov", weatherPayload]]),
  });

  assert.equal(snapshot.generatedAt, at.toISOString());
  assert.equal(snapshot.sources.power.freshness, "fresh");
  assert.equal(snapshot.sources.weather.freshness, "fresh");
  assert.equal(snapshot.sources.power.lastSuccessAt, at.toISOString());
  assert.deepEqual(snapshot.power[0], {
    countyFips: "37183",
    countyName: "Wake",
    customersOut: 12,
    customersServed: undefined,
    percentOut: undefined,
  });
  assert.equal(snapshot.alerts[0].countyFips[0], "37183");
});

test("refresh writes only a validated snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "netpulse-nc-"));
  const outputPath = join(directory, "nc-status.json");
  await refreshSnapshot({
    outputPath,
    fetchImpl: mockFetch([["spartagis.ncem.org", powerPayload], ["api.weather.gov", { features: [] }]]),
  });
  const snapshot = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(snapshot.sources.power.freshness, "fresh");
  assert.equal(snapshot.sources.weather.freshness, "fresh");
});

test("refresh rejects an upstream failure instead of publishing unavailable data", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(buildSnapshot({ fetchImpl }), /HTTP 503/);
});
