// The live BRouter check's comparison logic, tested offline against the recorded
// fixtures. No test here calls the network (ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brouterUrl } from "./brouter";
import {
  compareWithFixture,
  LIVE_CHECK_DELAY_MS,
  LIVE_CHECK_USER_AGENT,
  liveCheckCases,
  runLiveCheck,
  type RecordedResponse,
} from "./liveCheck";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const caseFor = (fixtureName: string) => {
  const found = liveCheckCases.find((c) => c.fixture === fixtureName);
  if (!found) throw new Error(`no live check case for ${fixtureName}`);
  return found;
};

const recorded = (fixtureName: string): RecordedResponse => ({
  status: caseFor(fixtureName).status,
  body: fixture(fixtureName),
});

/** A copy of a recorded GeoJSON response with its first feature edited. */
type EditableFeature = {
  properties: Record<string, unknown>;
  /** Positions as recorded ([lng, lat, elevation?]); tests may replace them with anything. */
  geometry: { coordinates: unknown[] };
};

function editedTrack(fixtureName: string, edit: (feature: EditableFeature) => void): RecordedResponse {
  const track = JSON.parse(fixture(fixtureName));
  edit(track.features[0]);
  return { status: 200, body: JSON.stringify(track) };
}

const levels = (findings: { level: string }[]) => new Set(findings.map((f) => f.level));

describe("live check cases", () => {
  it("covers the hiking and river profiles with at most four requests", () => {
    expect(liveCheckCases.length).toBeLessThanOrEqual(4);
    expect(liveCheckCases.map((c) => c.mode)).toContain("hike");
    expect(liveCheckCases.map((c) => c.mode)).toContain("paddle");
  });

  it("only names fixtures that exist", () => {
    for (const c of liveCheckCases) expect(() => fixture(c.fixture)).not.toThrow();
  });
});

describe("comparing a live response with its fixture", () => {
  it.each(liveCheckCases.map((c) => c.fixture))("reports only matches when the live response equals %s", async (name) => {
    const findings = await compareWithFixture(caseFor(name), recorded(name), recorded(name));
    expect(findings.length).toBeGreaterThan(0);
    expect(levels(findings)).toEqual(new Set(["match"]));
  });

  it("reports a mismatch when the HTTP status differs", async () => {
    const name = "hiking-success.geojson";
    const findings = await compareWithFixture(caseFor(name), { status: 500, body: "profile not found" }, recorded(name));
    expect(findings).toContainEqual(expect.objectContaining({ level: "mismatch", message: expect.stringMatching(/status/i) }));
  });

  it("reports a mismatch when the body is no longer GeoJSON", async () => {
    const name = "river-success.geojson";
    const findings = await compareWithFixture(caseFor(name), { status: 200, body: "<html>maintenance</html>" }, recorded(name));
    expect(levels(findings)).toContain("mismatch");
  });

  it("reports a mismatch when the geometry is no longer a LineString of [lng, lat, elevation]", async () => {
    const name = "hiking-success.geojson";
    const live = editedTrack(name, (f) => {
      f.geometry.coordinates = (f.geometry.coordinates as number[][]).map(([lng, lat]) => ({ lng, lat }));
    });
    const findings = await compareWithFixture(caseFor(name), live, recorded(name));
    expect(findings).toContainEqual(expect.objectContaining({ level: "mismatch", message: expect.stringMatching(/coordinates/i) }));
  });

  it("reports a mismatch when 'filtered ascend' disappears", async () => {
    const name = "hiking-success.geojson";
    const live = editedTrack(name, (f) => delete f.properties["filtered ascend"]);
    const findings = await compareWithFixture(caseFor(name), live, recorded(name));
    expect(findings).toContainEqual(
      expect.objectContaining({ level: "mismatch", message: expect.stringContaining("filtered ascend") }),
    );
  });

  it("reports a mismatch when the track points stop carrying elevations", async () => {
    const name = "river-success.geojson";
    const live = editedTrack(name, (f) => {
      f.geometry.coordinates = (f.geometry.coordinates as number[][]).map(([lng, lat]) => [lng, lat]);
    });
    const findings = await compareWithFixture(caseFor(name), live, recorded(name));
    expect(findings).toContainEqual(expect.objectContaining({ level: "mismatch", message: expect.stringMatching(/elevation/i) }));
  });

  it("reports a mismatch when the adapter's outcome changes (a no-route that now routes)", async () => {
    const name = "hiking-no-route-400.txt";
    const findings = await compareWithFixture(caseFor(name), recorded("hiking-success.geojson"), recorded(name));
    expect(findings).toContainEqual(expect.objectContaining({ level: "mismatch", message: expect.stringMatching(/adapter/i) }));
  });

  it("reports drift, not a mismatch, when the track length changes a lot but the shape still fits", async () => {
    const name = "hiking-success.geojson";
    const live = editedTrack(name, (f) => {
      f.properties["track-length"] = String(Number(f.properties["track-length"]) * 2);
    });
    const findings = await compareWithFixture(caseFor(name), live, recorded(name));
    expect(levels(findings)).not.toContain("mismatch");
    expect(findings).toContainEqual(expect.objectContaining({ level: "drift", message: expect.stringContaining("track-length") }));
  });

  it("reports drift when the server's BRouter version changes", async () => {
    const name = "river-success.geojson";
    const live = editedTrack(name, (f) => (f.properties.creator = "BRouter-1.8.0"));
    const findings = await compareWithFixture(caseFor(name), live, recorded(name));
    expect(levels(findings)).not.toContain("mismatch");
    expect(findings).toContainEqual(expect.objectContaining({ level: "drift", message: expect.stringContaining("BRouter-1.8.0") }));
  });

  it("tolerates small changes in the track (map data edits) as a match", async () => {
    const name = "hiking-success.geojson";
    const live = editedTrack(name, (f) => {
      f.properties["track-length"] = String(Number(f.properties["track-length"]) + 20);
      f.geometry.coordinates.splice(5, 1);
    });
    const findings = await compareWithFixture(caseFor(name), live, recorded(name));
    expect(levels(findings)).toEqual(new Set(["match"]));
  });

  it("reports a mismatch when a routing error no longer comes back as HTTP 400 text", async () => {
    const name = "hiking-no-route-400.txt";
    const findings = await compareWithFixture(caseFor(name), { status: 200, body: "" }, recorded(name));
    expect(levels(findings)).toContain("mismatch");
  });
});

describe("running the live check", () => {
  type FetchInit = { headers: Record<string, string> };

  /** A fake server that answers each case with its own fixture and logs what happened, in order. */
  function fakeServer(answer: (url: URL) => RecordedResponse = (url) => recordedFor(url)) {
    const events: string[] = [];
    const userAgents: (string | null)[] = [];
    const fetch = async (url: string, init: FetchInit) => {
      events.push("fetch");
      userAgents.push(new Headers(init.headers).get("user-agent"));
      const { status, body } = answer(new URL(url));
      return new Response(body, { status });
    };
    const wait = async (ms: number) => {
      events.push(`wait ${ms}`);
    };
    return { fetch, wait, events, userAgents };
  }

  function recordedFor(url: URL): RecordedResponse {
    const c = liveCheckCases.find((c) => brouterUrl(c.mode, c.points) === url.toString());
    if (!c) throw new Error(`unexpected request ${url}`);
    return recorded(c.fixture);
  }

  it("asks the server once per case, one at a time, with a pause between requests", async () => {
    const server = fakeServer();
    await runLiveCheck({ fetch: server.fetch, wait: server.wait, readFixture: fixture });

    const pause = `wait ${LIVE_CHECK_DELAY_MS}`;
    expect(server.events).toEqual(["fetch", pause, "fetch", pause, "fetch", pause, "fetch"]);
    expect(LIVE_CHECK_DELAY_MS).toBeGreaterThanOrEqual(1000);
  });

  it("identifies itself with the project URL, never a personal email", async () => {
    const server = fakeServer();
    await runLiveCheck({ fetch: server.fetch, wait: server.wait, readFixture: fixture });

    expect(LIVE_CHECK_USER_AGENT).toContain("https://github.com/elslander-cedric/packraft-go");
    expect(LIVE_CHECK_USER_AGENT).not.toMatch(/@/);
    expect(new Set(server.userAgents)).toEqual(new Set([LIVE_CHECK_USER_AGENT]));
  });

  it("passes when every live response matches its fixture", async () => {
    const server = fakeServer();
    const result = await runLiveCheck({ fetch: server.fetch, wait: server.wait, readFixture: fixture });

    expect(result.passed).toBe(true);
    expect(result.report).toMatch(/MATCH/);
    expect(result.report).not.toMatch(/MISMATCH/);
    for (const c of liveCheckCases) expect(result.report).toContain(c.name);
  });

  it("fails and names the problem when a live response no longer fits", async () => {
    const server = fakeServer((url) =>
      url.searchParams.get("profile") === "river" ? { status: 500, body: "profile not found" } : recordedFor(url),
    );
    const result = await runLiveCheck({ fetch: server.fetch, wait: server.wait, readFixture: fixture });

    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/MISMATCH.*status 500/);
  });

  it("passes with drift, and says so, when only values changed", async () => {
    const server = fakeServer((url) => {
      const response = recordedFor(url);
      return { ...response, body: response.body.replace("BRouter-1.7.10", "BRouter-1.8.0") };
    });
    const result = await runLiveCheck({ fetch: server.fetch, wait: server.wait, readFixture: fixture });

    expect(result.passed).toBe(true);
    expect(result.report).toMatch(/DRIFT.*BRouter-1\.8\.0/);
    expect(result.report).toMatch(/re-record/i);
  });

  it("fails, without stopping the run, when the server cannot be reached", async () => {
    const server = fakeServer();
    let calls = 0;
    const fetch = async (url: string, init: FetchInit) => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return server.fetch(url, init);
    };
    const result = await runLiveCheck({ fetch, wait: server.wait, readFixture: fixture });

    expect(calls).toBe(liveCheckCases.length);
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/MISMATCH.*fetch failed/);
  });
});
