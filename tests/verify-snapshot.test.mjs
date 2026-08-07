import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

const verifier = new URL("../scripts/verify-snapshot.mjs", import.meta.url);

function validSnapshot() {
  return {
    metadata: {
      mode: "live",
      sourceName: "IODA",
      sourceUrl: "https://ioda.inetintel.cc.gatech.edu/",
      fetchedAt: "2026-08-06T12:00:00.000Z",
      note: "Regional summary snapshot.",
      copyright: "IODA data.",
    },
    events: [],
  };
}

function validEvent() {
  return {
    id: "ioda-summary-in",
    kind: "internet",
    title: "Regional connectivity signal",
    region: "Indiana",
    state: "IN",
    name: "Indiana (state-level signal)",
    lat: 39.85,
    lon: -86.26,
    provider: "Multiple networks",
    network: "Regional internet measurements",
    detectionSource: "IODA regional outage summary",
    severity: "moderate",
    status: "Recorded in the last 24 hours",
    demo: false,
  };
}

async function runVerifier(snapshot) {
  const directory = await mkdtemp(join(tmpdir(), "netpulse-snapshot-"));
  const path = join(directory, "outages.json");
  await writeFile(path, JSON.stringify(snapshot), "utf8");
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(verifier), path], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts a valid but quiet live snapshot", async () => {
  const result = await runVerifier(validSnapshot());
  assert.equal(result.code, 0);
  assert.match(result.output, /valid/);
  assert.match(result.output, /zero events/i);
});

test("rejects a demo event mislabeled as live", async () => {
  const snapshot = validSnapshot();
  snapshot.events = [{ ...validEvent(), demo: true }];
  const result = await runVerifier(snapshot);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /live snapshots cannot contain demo events/i);
});

test("rejects an event outside U.S. coverage", async () => {
  const snapshot = validSnapshot();
  snapshot.events = [{ ...validEvent(), lat: 51.5072, lon: -0.1276 }];
  const result = await runVerifier(snapshot);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /outside the supported U\.S\. coverage area/i);
});
