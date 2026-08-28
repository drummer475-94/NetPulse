import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("static NC fallback is explicitly unavailable rather than fictional", async () => {
  const snapshot = JSON.parse(await readFile("public/data/nc-status.json", "utf8"));
  assert.equal(snapshot.schemaVersion, 1); assert.equal(snapshot.state, "NC");
  assert.equal(snapshot.sources.power.freshness, "unavailable"); assert.equal(snapshot.sources.weather.freshness, "unavailable");
  assert.deepEqual(snapshot.power, []); assert.deepEqual(snapshot.alerts, []);
});
