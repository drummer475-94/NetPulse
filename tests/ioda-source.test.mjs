import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSummaryUrl,
  matchState,
  normalizeSummary,
} from "../app/ioda-source.mjs";

const FIXTURE = {
  data: [
    {
      entity: { id: 4442, code: "4442", name: "Indiana, United States" },
      scores: { overall: 15400.567 },
      event_cnt: 1,
    },
    {
      entity: { id: 4422, code: "4422", name: "District of Columbia, United States" },
      scores: { overall: 15.053 },
      event_cnt: 1,
    },
    {
      entity: { id: 4451, code: "4451", name: "Idaho, United States" },
      scores: { overall: 4.2 },
      event_cnt: 0,
    },
  ],
};

test("maps IODA summary rows by entity name and preserves the confirmed scores", () => {
  const events = normalizeSummary(FIXTURE, {
    fromSeconds: 1_700_000_000,
    untilSeconds: 1_700_086_400,
  });

  assert.deepEqual(events.map((event) => event.state), ["IN", "DC"]);
  const indiana = events.find((event) => event.state === "IN");
  const district = events.find((event) => event.state === "DC");
  assert.equal(indiana?.severity, "major");
  assert.match(indiana?.summary ?? "", /1 event with an overall score of 15,400\.567/);
  assert.equal(district?.severity, "moderate");
  assert.match(district?.summary ?? "", /1 event with an overall score of 15\.053/);
  assert.equal(events.some((event) => event.state === "ID"), false);
  assert.equal(matchState("Indiana, United States", "4442")?.abbr, "IN");
  assert.equal(matchState("District of Columbia, United States", "4422")?.abbr, "DC");
});

test("never turns IODA summary rows into demo data or invented event timing", () => {
  const events = normalizeSummary(FIXTURE, { now: "2026-08-06T12:00:00.000Z" });

  assert.ok(events.length > 0);
  for (const event of events) {
    assert.equal(event.kind, "internet");
    assert.equal(event.demo, false);
    assert.equal(event.status, "Recorded in the last 24 hours");
    assert.equal("startedAt" in event, false);
    assert.equal("updatedAt" in event, false);
    assert.equal("endedAt" in event, false);
  }
});

test("uses a bounded aggregate U.S. summary URL", () => {
  const url = new URL(
    buildSummaryUrl({ fromSeconds: 1_700_000_000.9, untilSeconds: 1_700_086_400.9 }),
  );
  assert.equal(url.pathname, "/v2/outages/summary");
  assert.equal(url.searchParams.get("entityType"), "region");
  assert.equal(url.searchParams.get("relatedTo"), "country/US");
  assert.equal(url.searchParams.get("from"), "1700000000");
  assert.equal(url.searchParams.get("until"), "1700086400");
});
