import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const statesUrl = new URL("../app/us-states.json", import.meta.url).href;

async function loadZipResults(zips) {
  const source = await readFile(new URL("../app/us-geo.ts", import.meta.url), "utf8");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "netpulse-us-geo-"));
  const modulePath = join(temporaryDirectory, "us-geo.ts");
  const replacement = `import rawStates from ${JSON.stringify(statesUrl)} with { type: "json" };`;
  const moduleSource = source.replace(
    'import rawStates from "./us-states.json";',
    replacement,
  );

  try {
    await writeFile(modulePath, moduleSource, "utf8");
    const expression = [
      `const module = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
      `console.log(JSON.stringify(${JSON.stringify(zips)}.map((zip) => module.stateForZip(zip)?.abbr ?? null)));`,
    ].join("\n");
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "--eval", expression],
      { cwd: new URL("../", import.meta.url) },
    );
    return JSON.parse(stdout);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test("maps supported ZIP boundaries to state tiles and excludes Puerto Rico", async () => {
  assert.deepEqual(
    await loadZipResults(["00501", "30308", "88510", "96701", "99501", "00601"]),
    ["NY", "GA", "TX", "HI", "AK", null],
  );
});

test("defines exactly 51 unique state and DC cartogram cells", async () => {
  const states = JSON.parse(
    await readFile(new URL("../app/us-states.json", import.meta.url), "utf8"),
  );

  assert.equal(states.length, 51);
  assert.equal(new Set(states.map((state) => state.abbr)).size, 51);
  assert.equal(new Set(states.map((state) => `${state.row}:${state.col}`)).size, 51);
  for (const state of states) {
    assert.match(state.abbr, /^[A-Z]{2}$/);
    assert.equal(typeof state.name, "string");
    assert.ok(Number.isFinite(state.lat));
    assert.ok(Number.isFinite(state.lon));
    assert.ok(Number.isInteger(state.row) && state.row > 0);
    assert.ok(Number.isInteger(state.col) && state.col > 0);
  }
});
