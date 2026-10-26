// Acceptance tests for #29 (manual live BRouter check) written from the
// ticket's acceptance criteria. Everything runs offline: the global fetch is replaced
// by one that fails the test if anything tries to reach the network (ADR 0019).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { brouterUrl } from "./brouter";
import { LIVE_CHECK_USER_AGENT, liveCheckCases, runLiveCheck, type LiveCheckDeps } from "./liveCheck";

const root = path.join(__dirname, "..", "..");
const fixturesDir = path.join(__dirname, "fixtures");
const readFixture = (name: string) => readFileSync(path.join(fixturesDir, name), "utf8");

const realFetch = globalThis.fetch;
const networkFetch = vi.fn(() => {
  throw new Error("network access is not allowed in tests");
});
beforeAll(() => {
  globalThis.fetch = networkFetch as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  expect(networkFetch).not.toHaveBeenCalled();
});

type Answer = { status: number; body: string };

/** A fake BRouter: answers each live-check case with its recorded fixture, optionally doctored. */
function fakeServer(doctor: (fixture: string, answer: Answer) => Answer = (_f, a) => a) {
  let inFlight = 0;
  let maxInFlight = 0;
  const log: { type: "fetch" | "wait"; ms?: number; url?: string; userAgent?: string }[] = [];
  const deps: LiveCheckDeps = {
    fetch: async (url, init) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      log.push({ type: "fetch", url, userAgent: init.headers["User-Agent"] });
      await new Promise((r) => setTimeout(r, 5));
      const c = liveCheckCases.find((k) => brouterUrl(k.mode, k.points) === url);
      inFlight -= 1;
      if (!c) return new Response("unexpected request", { status: 500 });
      const answer = doctor(c.fixture, { status: c.status, body: readFixture(c.fixture) });
      return new Response(answer.body, { status: answer.status });
    },
    wait: async (ms) => {
      log.push({ type: "wait", ms });
    },
    readFixture,
  };
  return { deps, log, maxInFlight: () => maxInFlight };
}

/** Edits the first feature of a GeoJSON fixture body. */
function editTrack(
  body: string,
  edit: (feature: { properties: Record<string, unknown>; geometry: { coordinates: number[][] } }) => void,
) {
  const geojson = JSON.parse(body);
  edit(geojson.features[0]);
  return JSON.stringify(geojson);
}

const onlyFor =
  (fixture: string, change: (a: Answer) => Answer) =>
  (name: string, a: Answer): Answer =>
    name === fixture ? change(a) : a;

describe("AC1: at most ~4 live requests, sequential and polite", () => {
  it("makes at most four requests, never two at once, with a pause of at least 1 s between them", async () => {
    const server = fakeServer();
    await runLiveCheck(server.deps);

    const fetches = server.log.filter((e) => e.type === "fetch");
    expect(fetches.length).toBeGreaterThan(0);
    expect(fetches.length).toBeLessThanOrEqual(4);
    expect(server.maxInFlight()).toBe(1);
    // Every pair of consecutive fetches has a wait in between.
    const types = server.log.map((e) => e.type).join(",");
    expect(types).not.toContain("fetch,fetch");
    for (const w of server.log.filter((e) => e.type === "wait")) expect(w.ms).toBeGreaterThanOrEqual(1000);
  });

  it("covers both the hiking-mountain and river profiles", async () => {
    const server = fakeServer();
    await runLiveCheck(server.deps);
    const profiles = server.log.filter((e) => e.type === "fetch").map((e) => new URL(e.url!).searchParams.get("profile"));
    expect(profiles).toContain("hiking-mountain");
    expect(profiles).toContain("river");
  });

  it("prints a clear per-check report and an overall verdict", async () => {
    const result = await runLiveCheck(fakeServer().deps);
    expect(result.passed).toBe(true);
    expect(result.report).toMatch(/^PASSED/m);
    for (const c of liveCheckCases) expect(result.report).toContain(c.fixture);
  });
});

describe("User-Agent", () => {
  it("names only the project, with no email or personal name outside the project URL", async () => {
    const server = fakeServer();
    await runLiveCheck(server.deps);
    for (const f of server.log.filter((e) => e.type === "fetch")) expect(f.userAgent).toBe(LIVE_CHECK_USER_AGENT);

    expect(LIVE_CHECK_USER_AGENT).not.toMatch(/[^\s@]+@[^\s@]+/);
    const withoutUrl = LIVE_CHECK_USER_AGENT.replace("https://github.com/elslander-cedric/packraft-go", "");
    expect(withoutUrl.toLowerCase()).not.toMatch(/cedric|elslander|gmail/);
  });
});

describe("AC2: never part of npm test, npm run e2e or CI", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };

  it("no other npm script (including pre/post hooks) runs the live check", () => {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      if (name === "check:brouter") continue;
      expect(command, name).not.toMatch(/check:brouter|check-brouter|liveCheck/);
    }
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.e2e).toBe("playwright test");
  });

  it("CI workflows never mention the live check or the scripts folder", () => {
    const dir = path.join(root, ".github", "workflows");
    for (const file of readdirSync(dir)) {
      const text = readFileSync(path.join(dir, file), "utf8");
      expect(text, file).not.toMatch(/check:brouter|check-brouter|scripts\//);
    }
  });

  it("the entry script is outside what Vitest and Playwright collect", () => {
    const vitestConfig = readFileSync(path.join(root, "vitest.config.ts"), "utf8");
    expect(vitestConfig).toMatch(/include:\s*\["src\/\*\*\/\*\.test\.ts"\]/);
    const playwrightConfig = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
    expect(playwrightConfig).toMatch(/testDir:\s*"\.\/e2e"/);
    expect(readFileSync(path.join(root, "scripts", "check-brouter.mts"), "utf8")).toContain("runLiveCheck");
  });
});

describe("AC4: fixtures are only read, never written", () => {
  const hashFixtures = () =>
    Object.fromEntries(
      readdirSync(fixturesDir).map((f) => [f, createHash("sha256").update(readFileSync(path.join(fixturesDir, f))).digest("hex")]),
    );

  it("leaves every fixture byte-for-byte unchanged after a run full of drift and mismatches", async () => {
    const before = hashFixtures();
    await runLiveCheck(
      fakeServer((name, a) =>
        name.endsWith(".geojson") ? { status: 200, body: a.body.replace("BRouter-1.7.10", "BRouter-9.9.9") } : { status: 500, body: "" },
      ).deps,
    );
    expect(hashFixtures()).toEqual(before);
  });

  it("neither the check nor its entry script uses any file-writing API", () => {
    for (const file of ["src/routing/liveCheck.ts", "scripts/check-brouter.mts"]) {
      const text = readFileSync(path.join(root, file), "utf8");
      expect(text, file).not.toMatch(/writeFile|appendFile|createWriteStream|copyFile|rename|unlink|rmSync|\brm\(|mkdir/);
    }
  });
});

describe("MATCH / DRIFT / MISMATCH on doctored copies of the fixtures", () => {
  it("a missing key field (filtered ascend) on the river answer is a mismatch and fails the run", async () => {
    const result = await runLiveCheck(
      fakeServer(
        onlyFor("river-success.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => delete f.properties["filtered ascend"]),
        })),
      ).deps,
    );
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/MISMATCH.*filtered ascend/);
  });

  it("a missing track-length is a mismatch", async () => {
    const result = await runLiveCheck(
      fakeServer(
        onlyFor("hiking-success.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => delete f.properties["track-length"]),
        })),
      ).deps,
    );
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/MISMATCH.*track-length/);
  });

  it("an empty features list is a mismatch", async () => {
    const result = await runLiveCheck(
      fakeServer(
        onlyFor("hiking-success.geojson", (a) => ({ ...a, body: JSON.stringify({ type: "FeatureCollection", features: [] }) })),
      ).deps,
    );
    expect(result.passed).toBe(false);
  });

  it("track-length switching from metres to kilometres is flagged (drift), not silently matched", async () => {
    const result = await runLiveCheck(
      fakeServer(
        onlyFor("hiking-success.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => {
            f.properties["track-length"] = String(Number(f.properties["track-length"]) / 1000);
          }),
        })),
      ).deps,
    );
    expect(result.report).toMatch(/(DRIFT|MISMATCH).*track-length/);
    expect(result.report).not.toMatch(/^PASSED: the live server still matches/m);
  });

  it("elevations switching from metres to feet (points and climb) is flagged, not silently matched", async () => {
    const result = await runLiveCheck(
      fakeServer(
        onlyFor("hiking-success.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => {
            f.geometry.coordinates = f.geometry.coordinates.map(([lng, lat, ele]) => [lng, lat, ele * 3.28084]);
            f.properties["filtered ascend"] = String(Math.round(Number(f.properties["filtered ascend"]) * 3.28084));
          }),
        })),
      ).deps,
    );
    expect(result.report).toMatch(/(DRIFT|MISMATCH).*filtered ascend/);
  });

  it.each([0.5, 1.5])("a distance change to %s x (track-length and points) is drift: reported, but the run passes", async (factor) => {
    const result = await runLiveCheck(
      fakeServer(
        onlyFor("river-success.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => {
            f.properties["track-length"] = String(Math.round(Number(f.properties["track-length"]) * factor));
            const coords = f.geometry.coordinates;
            f.geometry.coordinates =
              factor < 1 ? coords.slice(0, Math.round(coords.length * factor)) : [...coords, ...coords.slice(0, coords.length / 2)];
          }),
        })),
      ).deps,
    );
    expect(result.passed).toBe(true);
    expect(result.report).toMatch(/DRIFT.*track-length/);
    expect(result.report).toMatch(/DRIFT.*track points/);
    expect(result.report).toMatch(/PASSED with \d+ drift/);
    expect(result.report).not.toMatch(/MISMATCH/);
  });

  it("track-length within 10% is a match; just beyond is drift", async () => {
    const run = (factor: number) =>
      runLiveCheck(
        fakeServer(
          onlyFor("hiking-success.geojson", (a) => ({
            ...a,
            body: editTrack(a.body, (f) => {
              f.properties["track-length"] = String(Number(f.properties["track-length"]) * factor);
            }),
          })),
        ).deps,
      );
    expect((await run(1.09)).report).not.toMatch(/DRIFT/);
    expect((await run(1.11)).report).toMatch(/DRIFT.*track-length/);
  });

  it("the no-route case that suddenly routes is a mismatch", async () => {
    const result = await runLiveCheck(
      fakeServer(onlyFor("hiking-no-route-400.txt", () => ({ status: 200, body: readFixture("hiking-success.geojson") }))).deps,
    );
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/MISMATCH.*adapter outcome/);
  });

  it("the ferry case gaining elevations is drift, losing all elevations on a normal track is a mismatch", async () => {
    const gained = await runLiveCheck(
      fakeServer(
        onlyFor("hiking-missing-elevation.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => {
            f.geometry.coordinates = f.geometry.coordinates.map(([lng, lat]) => [lng, lat, 0]);
          }),
        })),
      ).deps,
    );
    expect(gained.passed).toBe(true);
    expect(gained.report).toMatch(/DRIFT.*elevation/);

    const lost = await runLiveCheck(
      fakeServer(
        onlyFor("hiking-success.geojson", (a) => ({
          ...a,
          body: editTrack(a.body, (f) => {
            f.geometry.coordinates = f.geometry.coordinates.map(([lng, lat]) => [lng, lat]);
          }),
        })),
      ).deps,
    );
    expect(lost.passed).toBe(false);
  });
});
