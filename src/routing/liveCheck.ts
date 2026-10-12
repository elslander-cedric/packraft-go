// Live BRouter check (issue #29): compares what the public BRouter server answers
// today with the recorded fixtures our tests replay, so we notice when the server
// changes its profiles or response format. Run by hand with `npm run check:brouter`;
// never part of `npm test`, `npm run e2e` or CI (ADR 0019). Nothing here writes
// fixtures: re-recording stays a deliberate step.
import type { RouteResult } from "@/core/router";
import type { LatLng, LegMode } from "@/core/trip";
import { createBRouterRouter } from "./brouter";

/** One request to replay against the live server, and the fixture it was recorded as. */
export type LiveCheckCase = {
  name: string;
  mode: LegMode;
  points: readonly LatLng[];
  /** File name in `src/routing/fixtures/`. */
  fixture: string;
  /** HTTP status of the recorded response. */
  status: number;
};

/** An HTTP response reduced to what the adapter looks at. */
export type RecordedResponse = { status: number; body: string };

/**
 * - `match`: the live server still answers the way the fixture and adapter expect.
 * - `drift`: values changed (map data, server version) but the adapter still copes;
 *   consider re-recording the fixture.
 * - `mismatch`: the shape or outcome changed; the live app is probably broken.
 */
export type FindingLevel = "match" | "drift" | "mismatch";
export type Finding = { level: FindingLevel; message: string };

/** Points as listed in `src/routing/fixtures/README.md`. At most four, to be polite to the public server. */
export const liveCheckCases: readonly LiveCheckCase[] = [
  {
    name: "hike leg, hiking-mountain profile",
    mode: "hike",
    points: [
      { lat: 50.3527, lng: 5.4561 },
      { lat: 50.344, lng: 5.47 },
    ],
    fixture: "hiking-success.geojson",
    status: 200,
  },
  {
    name: "hike leg without height data (ferry)",
    mode: "hike",
    points: [
      { lat: 51.6, lng: 2.5 },
      { lat: 51.61, lng: 2.52 },
    ],
    fixture: "hiking-missing-elevation.geojson",
    status: 200,
  },
  {
    name: "hike leg outside the map data (routing error)",
    mode: "hike",
    points: [
      { lat: 40.0, lng: -30.0 },
      { lat: 40.05, lng: -29.9 },
    ],
    fixture: "hiking-no-route-400.txt",
    status: 400,
  },
  {
    name: "paddle leg, river profile (Lesse)",
    mode: "paddle",
    points: [
      { lat: 50.216, lng: 4.933 },
      { lat: 50.237, lng: 4.912 },
    ],
    fixture: "river-success.geojson",
    status: 200,
  },
];

/** Track length may differ by this share before we call it drift. */
const TRACK_LENGTH_TOLERANCE = 0.1;
/** Number of track points may differ by this share before we call it drift. */
const POINT_COUNT_TOLERANCE = 0.2;

export async function compareWithFixture(
  check: LiveCheckCase,
  live: RecordedResponse,
  recorded: RecordedResponse,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const match = (message: string) => findings.push({ level: "match", message });
  const drift = (message: string) => findings.push({ level: "drift", message });
  const mismatch = (message: string) => findings.push({ level: "mismatch", message });

  if (live.status === recorded.status) {
    match(`HTTP status ${live.status}`);
    if (recorded.status === 200) compareTracks(live.body, recorded.body, { match, drift, mismatch });
    else if (live.body.trim() === "") mismatch("routing error came back with an empty body");
    else match(`routing error message: ${live.body.trim()}`);
  } else {
    mismatch(`HTTP status ${live.status}, fixture has ${recorded.status}`);
  }

  const [liveOutcome, recordedOutcome] = await Promise.all([
    adapterOutcome(check, live),
    adapterOutcome(check, recorded),
  ]);
  if (liveOutcome === recordedOutcome) match(`adapter outcome: ${liveOutcome}`);
  else mismatch(`adapter outcome: ${liveOutcome}, fixture gives ${recordedOutcome}`);

  return findings;
}

type Report = Record<FindingLevel, (message: string) => void>;

type Track = {
  properties: Record<string, unknown>;
  coordinates: unknown[];
};

function compareTracks(liveBody: string, recordedBody: string, report: Report) {
  const fixture = readTrack(recordedBody);
  if (typeof fixture === "string") throw new Error(`recorded fixture is not a BRouter track: ${fixture}`);
  const live = readTrack(liveBody);
  if (typeof live === "string") {
    report.mismatch(live);
    return;
  }
  report.match("GeoJSON FeatureCollection with a LineString feature");

  const badPosition = live.coordinates.find((p) => !isPosition(p));
  if (badPosition !== undefined) {
    report.mismatch(`coordinates are not [lng, lat, elevation?] numbers, e.g. ${JSON.stringify(badPosition)}`);
    return;
  }
  report.match("coordinates are [lng, lat, elevation?] numbers");

  const fixtureHasElevation = (fixture.coordinates as number[][]).some((p) => p.length >= 3);
  const liveHasElevation = (live.coordinates as number[][]).some((p) => p.length >= 3);
  if (fixtureHasElevation === liveHasElevation) {
    report.match(liveHasElevation ? "track points carry elevations" : "track points carry no elevation, as recorded");
  } else if (fixtureHasElevation) {
    report.mismatch("track points no longer carry an elevation");
  } else {
    report.drift("track points now carry elevations where the fixture had none");
  }

  compareNumberProperty("filtered ascend", live, fixture, report, (liveValue, fixtureValue) =>
    liveValue === fixtureValue ? "match" : "drift",
  );
  compareNumberProperty("track-length", live, fixture, report, (liveValue, fixtureValue) =>
    withinShare(liveValue, fixtureValue, TRACK_LENGTH_TOLERANCE) ? "match" : "drift",
  );

  const livePoints = live.coordinates.length;
  const fixturePoints = fixture.coordinates.length;
  if (withinShare(livePoints, fixturePoints, POINT_COUNT_TOLERANCE)) {
    report.match(`${livePoints} track points (fixture: ${fixturePoints})`);
  } else {
    report.drift(`${livePoints} track points, fixture has ${fixturePoints}`);
  }

  const liveCreator = String(live.properties.creator);
  const fixtureCreator = String(fixture.properties.creator);
  if (liveCreator === fixtureCreator) report.match(`server version ${liveCreator}`);
  else report.drift(`server version ${liveCreator}, fixture recorded with ${fixtureCreator}`);
}

/** Returns the track, or a description of why the body is not one. */
function readTrack(body: string): Track | string {
  let geojson: unknown;
  try {
    geojson = JSON.parse(body);
  } catch {
    return "body is not JSON";
  }
  const collection = geojson as { type?: unknown; features?: unknown };
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return "body is not a GeoJSON FeatureCollection";
  }
  const feature = collection.features[0] as
    | { properties?: unknown; geometry?: { type?: unknown; coordinates?: unknown } }
    | undefined;
  if (feature?.geometry?.type !== "LineString") return "first feature is not a LineString";
  if (!Array.isArray(feature.geometry.coordinates)) return "LineString has no coordinates array";
  if (typeof feature.properties !== "object" || feature.properties === null) return "feature has no properties";
  return { properties: feature.properties as Record<string, unknown>, coordinates: feature.geometry.coordinates };
}

function isPosition(p: unknown): boolean {
  return Array.isArray(p) && (p.length === 2 || p.length === 3) && p.every((n) => typeof n === "number");
}

function compareNumberProperty(
  key: string,
  live: Track,
  fixture: Track,
  report: Report,
  judge: (liveValue: number, fixtureValue: number) => "match" | "drift",
) {
  const fixtureValue = Number.parseFloat(String(fixture.properties[key]));
  const liveValue = Number.parseFloat(String(live.properties[key]));
  if (!Number.isFinite(liveValue)) {
    report.mismatch(`property "${key}" is missing or not a number (got ${JSON.stringify(live.properties[key])})`);
    return;
  }
  const level = judge(liveValue, fixtureValue);
  report[level](`"${key}" is ${liveValue} (fixture: ${fixtureValue})`);
}

function withinShare(value: number, reference: number, share: number): boolean {
  return Math.abs(value - reference) <= Math.abs(reference) * share;
}

/** What the adapter makes of a response: `ok`, or the failure kind. */
async function adapterOutcome(check: LiveCheckCase, response: RecordedResponse): Promise<string> {
  const router = createBRouterRouter({
    fetch: async () => new Response(response.body, { status: response.status }),
  });
  const result: RouteResult = await router.route(check.mode, check.points);
  return result.ok ? "ok" : result.failure.kind;
}
