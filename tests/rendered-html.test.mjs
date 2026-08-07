import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the state-resolution NetPulse shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>NetPulse/);
  assert.match(html, /Internet health, at state resolution/);
  assert.match(html, /broad connectivity signals without pretending they are street-level outages/i);
  assert.match(html, /Find your state/);
  assert.match(html, /U\.S\. ZIP code/);
  assert.match(html, /Use device location/);
  assert.match(html, /U\.S\. signal map/);
  assert.match(html, /Each tile represents a state or DC/);
  assert.match(html, /Signals in the last 24 hours/);
  assert.match(html, /What NetPulse is showing/);
  assert.match(html, /browser contacts Georgia Tech directly/i);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="State outage signal map"/);
  assert.doesNotMatch(html, /Signals around you|Internet signals|Coming soon/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("ships a truthfully labelled fallback snapshot", async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL("../public/data/outages.json", import.meta.url),
      "utf8",
    ),
  );

  assert.ok(["live", "demo", "unavailable"].includes(snapshot.metadata.mode));
  assert.ok(snapshot.metadata.fetchedAt);
  assert.ok(snapshot.metadata.sourceUrl);
  assert.ok(Array.isArray(snapshot.events));
  for (const event of snapshot.events) {
    assert.equal(event.kind, "internet");
    assert.equal(typeof event.demo, "boolean");
    assert.ok(["major", "moderate", "recovering"].includes(event.severity));
    assert.equal(typeof event.lat, "number");
    assert.equal(typeof event.lon, "number");
    assert.ok(event.detectionSource);
    if (snapshot.metadata.mode === "live") assert.equal(event.demo, false);
    if (snapshot.metadata.mode === "demo") assert.equal(event.demo, true);
  }
  if (snapshot.metadata.mode === "unavailable") assert.equal(snapshot.events.length, 0);
});

test("keeps Sites and GitHub Pages build paths and data checks intact", async () => {
  const [packageJson, nextConfig, pagesWorkflow, dataWorkflow, adapter, fetcher, iodaSource] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
      readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
      readFile(new URL("../.github/workflows/data-check.yml", import.meta.url), "utf8"),
      readFile(new URL("../app/outage-data.ts", import.meta.url), "utf8"),
      readFile(new URL("../scripts/fetch-outages.mjs", import.meta.url), "utf8"),
      readFile(new URL("../app/ioda-source.mjs", import.meta.url), "utf8"),
    ]);

  assert.match(packageJson, /"build":\s*"[^"]*vinext build"/);
  assert.match(packageJson, /"build:pages":\s*"next build"/);
  assert.match(packageJson, /"data:refresh"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(nextConfig, /output:\s*isVinextBuild\s*\?\s*undefined\s*:\s*"export"/);
  assert.match(nextConfig, /unoptimized:\s*true/);
  assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(pagesWorkflow, /actions\/configure-pages@v5/);
  assert.match(pagesWorkflow, /actions\/deploy-pages@v4/);
  assert.match(pagesWorkflow, /actions\/upload-pages-artifact@v4/);
  assert.match(pagesWorkflow, /npm run data:refresh/);
  assert.match(pagesWorkflow, /node scripts\/verify-snapshot\.mjs/);
  assert.match(pagesWorkflow, /npm run build:pages/);
  assert.match(dataWorkflow, /scripts\/probe-ioda\.mjs/);
  assert.match(dataWorkflow, /node scripts\/verify-snapshot\.mjs/);
  assert.match(adapter, /"internet"\s*\|\s*"power"/);
  assert.match(adapter, /haversineMiles/);
  assert.match(adapter, /bearingDegrees/);
  assert.match(
    await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    /og\.png/,
  );
  assert.match(fetcher, /normalizeSummary/);
  assert.match(iodaSource, /relatedTo",\s*"country\/US"/);
  assert.match(iodaSource, /outages\/summary/);

  await Promise.all([
    assert.rejects(
      access(
        new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url),
      ),
    ),
    assert.rejects(
      access(new URL("../app/_sites-preview/preview.css", import.meta.url)),
    ),
  ]);
});
