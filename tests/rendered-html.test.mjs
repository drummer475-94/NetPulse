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

test("server-renders the NetPulse product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>NetPulse — Internet outage signals near you<\/title>/i,
  );
  assert.match(html, /Know when the internet goes quiet\./);
  assert.match(html, /U\.S\. ZIP code/);
  assert.match(html, /Use my location/);
  assert.match(html, /Signals around you/);
  assert.match(html, /Internet signals/);
  assert.match(html, /Power/);
  assert.match(html, /Coming soon/);
  assert.match(html, /Georgia Tech/);
  assert.match(html, /Demo data/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("ships a future-ready, explicitly labeled outage snapshot", async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL("../public/data/outages.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(snapshot.metadata.mode, "demo");
  assert.match(snapshot.metadata.note, /Fictional/i);
  assert.ok(snapshot.metadata.fetchedAt);
  assert.ok(snapshot.events.length >= 3);
  for (const event of snapshot.events) {
    assert.equal(event.kind, "internet");
    assert.equal(event.demo, true);
    assert.ok(["major", "moderate", "recovering"].includes(event.severity));
    assert.equal(typeof event.lat, "number");
    assert.equal(typeof event.lon, "number");
    assert.ok(event.startedAt);
    assert.ok(event.updatedAt);
    assert.ok(event.detectionSource);
  }
});

test("keeps Sites and GitHub Pages build paths intact", async () => {
  const [packageJson, nextConfig, workflow, adapter, fetcher] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../.github/workflows/pages.yml", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/outage-data.ts", import.meta.url), "utf8"),
      readFile(new URL("../scripts/fetch-outages.mjs", import.meta.url), "utf8"),
    ]);

  assert.match(packageJson, /"build":\s*"[^"]*vinext build"/);
  assert.match(packageJson, /"build:pages":\s*"next build"/);
  assert.match(packageJson, /"data:refresh"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(nextConfig, /output:\s*isVinextBuild\s*\?\s*undefined\s*:\s*"export"/);
  assert.match(nextConfig, /unoptimized:\s*true/);
  assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /npm run data:refresh/);
  assert.match(workflow, /npm run build:pages/);
  assert.match(adapter, /"internet"\s*\|\s*"power"/);
  assert.match(adapter, /haversineMiles/);
  assert.match(adapter, /bearingDegrees/);
  assert.match(
    await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    /og\.png/,
  );
  assert.match(fetcher, /relatedTo:\s*"country\/US"/);
  assert.match(fetcher, /"outages\/events"/);
  assert.match(fetcher, /overall:\s*true/);

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
