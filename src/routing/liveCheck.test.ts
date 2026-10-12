// The live BRouter check's comparison logic, tested offline against the recorded
// fixtures. No test here calls the network (ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareWithFixture, liveCheckCases, type RecordedResponse } from "./liveCheck";

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
function editedTrack(fixtureName: string, edit: (feature: Record<string, any>) => void): RecordedResponse {
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
      f.geometry.coordinates = f.geometry.coordinates.map(([lng, lat]: number[]) => ({ lng, lat }));
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
      f.geometry.coordinates = f.geometry.coordinates.map(([lng, lat]: number[]) => [lng, lat]);
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
