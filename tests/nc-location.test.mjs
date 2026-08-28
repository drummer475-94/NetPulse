import assert from "node:assert/strict";
import test from "node:test";
import { countyFipsAt, lookupNcZip } from "../lib/nc-location.ts";
import { fetchCountyBoundaries } from "../scripts/fetch-nc-geography.mjs";

const rowanBoundary = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { GEOID: "37159" },
    geometry: {
      type: "Polygon",
      coordinates: [[[-80.8, 35.4], [-80.2, 35.4], [-80.2, 36], [-80.8, 36], [-80.8, 35.4]]],
    },
  }],
};

test("accepts a five-digit Rowan County ZIP", () => {
  assert.deepEqual(lookupNcZip("28138"), { status: "matched", fips: "37159" });
  assert.deepEqual(lookupNcZip(" 28138 "), { status: "matched", fips: "37159" });
});

test("distinguishes malformed and unsupported ZIP codes", () => {
  assert.deepEqual(lookupNcZip("2813"), { status: "invalid" });
  assert.deepEqual(lookupNcZip("28A38"), { status: "invalid" });
  assert.deepEqual(lookupNcZip("99999"), { status: "unsupported" });
});

test("matches a device coordinate against local county boundaries", () => {
  assert.equal(countyFipsAt(-80.47, 35.64, rowanBoundary), "37159");
  assert.equal(countyFipsAt(-78.64, 35.78, rowanBoundary), undefined);
});

test("validates the Census boundary response before publishing it", async () => {
  let requestedUrl;
  const features = Array.from({ length: 100 }, (_, index) => ({
    type: "Feature",
    properties: { GEOID: `37${String(index * 2 + 1).padStart(3, "0")}` },
    geometry: rowanBoundary.features[0].geometry,
  }));
  const collection = await fetchCountyBoundaries({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => ({ type: "FeatureCollection", features }) };
    },
  });
  assert.equal(collection.features.length, 100);
  assert.equal(requestedUrl.searchParams.get("where"), "STATE='37'");
  assert.equal(requestedUrl.searchParams.get("maxAllowableOffset"), "0.001");
});
