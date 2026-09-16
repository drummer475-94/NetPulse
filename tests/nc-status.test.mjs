import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildSnapshot, refreshSnapshot } from "../scripts/fetch-nc-status.mjs";

const powerHtml = `
  <table>
    <tbody class="tableCountyLabel"><tr><td>County</td><td># Outages</td></tr></tbody>
    <tbody class="tableCountyContent">
      <tr><td>Wake County</td><td><div>12</div></td></tr>
      <tr><td>New Hanover</td><td><div>1,503</div></td></tr>
    </tbody>
    <tbody class="tableCountyLabel"><tr><td>Statewide Outages</td><td><div>1,515</div></td></tr></tbody>
  </table>`;
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
    return {
      ok: true,
      status: 200,
      text: async () => String(url).includes("fusion.ncsparta.gov") ? powerHtml : JSON.stringify(payload),
      json: async () => payload,
    };
  };
}

test("build-time refresh creates a fresh snapshot from both official feeds", async () => {
  const at = new Date("2026-08-28T22:00:00Z");
  const snapshot = await buildSnapshot({
    at,
    fetchImpl: mockFetch([["fusion.ncsparta.gov", powerHtml], ["api.weather.gov", weatherPayload]]),
  });

  assert.equal(snapshot.generatedAt, at.toISOString());
  assert.equal(snapshot.sources.power.freshness, "fresh");
  assert.equal(snapshot.sources.weather.freshness, "fresh");
  assert.equal(snapshot.sources.power.lastSuccessAt, at.toISOString());
  assert.deepEqual(snapshot.power.find((county) => county.countyName === "Wake"), {
    countyFips: "37183",
    countyName: "Wake",
    customersOut: 12,
  });
  assert.equal(snapshot.alerts[0].countyFips[0], "37183");
});

test("refresh writes only a validated snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "netpulse-nc-"));
  const outputPath = join(directory, "nc-status.json");
  await refreshSnapshot({
    outputPath,
    fetchImpl: mockFetch([["fusion.ncsparta.gov", powerHtml], ["api.weather.gov", { features: [] }]]),
  });
  const snapshot = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(snapshot.sources.power.freshness, "fresh");
  assert.equal(snapshot.sources.weather.freshness, "fresh");
});

test("refresh rejects an upstream failure instead of publishing unavailable data", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(buildSnapshot({ fetchImpl }), /HTTP 503/);
});
