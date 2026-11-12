// Export as GPX: one track and one segment through the whole trip, named after it, and a waypoint
// where each section starts plus one at the end. Trips are built with the core's public edits and
// a fake router, exported, and read back with a plain XML parser and the GPX 1.1 structure check.
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { strings } from "../ui/strings";
import { tripToGpx, type GpxNames } from "./gpx";
import type { RouteResult, RoutedPoint } from "./router";
import { createAutoRouter } from "./routing";
import { routingInto } from "./testing/routingDispatch";
import { createFakeRouter } from "./testing/fakeRouter";
import { applyEdit, emptyTrip, renameTrip, type Edit, type LatLng, type Trip } from "./trip";

const names: GpxNames = { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName, end: strings.gpxEnd };

const P0 = { lat: 50.3527, lng: 5.4561 };
const P1 = { lat: 50.2678, lng: 5.4469 };
const P2 = { lat: 50.1833, lng: 5.5756 };
const P3 = { lat: 50.1, lng: 5.6 };

const edit = (trip: Trip, ...edits: Edit[]) => edits.reduce(applyEdit, trip);
const add = (at: LatLng): Edit => ({ type: "addPoint", at });

/** A routed result for a leg from `a` to `b` through one middle point, with distinct elevations. */
const routedBetween = (a: LatLng, b: LatLng, base: number): RouteResult => ({
  ok: true,
  geometry: [
    { ...a, elevation: base },
    { lat: (a.lat + b.lat) / 2 + 0.001, lng: (a.lng + b.lng) / 2, elevation: base + 12.5 },
    { ...b, elevation: base + 3 },
  ],
});

/** Routes every leg of `trip` once with a fake router answering each mode. */
async function routeAll(trip: Trip, results: Parameters<typeof createFakeRouter>[0]) {
  let current = trip;
  const auto = createAutoRouter(createFakeRouter(results), routingInto((change) => (current = change(current))));
  await auto.sync(current);
  return current;
}

const routedGeometry = (trip: Trip, leg: number): readonly RoutedPoint[] => {
  const route = trip.legs[leg].route;
  if (route?.status !== "routed") throw new Error(`leg ${leg} is not routed`);
  return route.geometry;
};

/** The export's file (the trip has legs), parsed with the GPX 1.1 structure check. */
function exported(trip: Trip) {
  const file = tripToGpx(trip, names);
  if (!file) throw new Error("no GPX for this trip");
  return { ...file, gpx: parseGpx11(file.text) };
}

/** Parses with a strict XML parser that throws on any error, returning the document. */
function xml(text: string) {
  return new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(message);
    },
  }).parseFromString(text, "application/xml");
}

describe("export produces valid GPX 1.1", () => {
  it("is well-formed XML with a GPX 1.1 root, namespace, version and creator", async () => {
    const trip = await routeAll(edit(renameTrip(emptyTrip(), "Ourthe"), add(P0), add(P1)), {
      hike: routedBetween(P0, P1, 100),
    });
    // Updated: ADR 0037. The export is one file.
    const file = exported(trip);
    const doc = xml(file.text);
    const root = doc.documentElement!;
    expect(root.localName).toBe("gpx");
    expect(root.namespaceURI).toBe("http://www.topografix.com/GPX/1/1");
    expect(root.getAttribute("version")).toBe("1.1");
    expect(root.getAttribute("creator")).toBeTruthy();
    expect(() => parseGpx11(file.text)).not.toThrow();
  });

  it("The file holds metadata, a waypoint per section and the end, then exactly one track", async () => {
    const trip = await routeAll(
      edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "toggleCamp", index: 1 }),
      { hike: routedBetween(P0, P1, 100) },
    );
    const { text } = exported(trip);
    const order = [...(xml(text).documentElement!.childNodes as unknown as Node[])]
      .filter((n) => n.nodeType === 1)
      .map((n) => (n as Element).localName);
    expect(order).toEqual(["metadata", "wpt", "wpt", "wpt", "trk"]);
    expect(xml(text).getElementsByTagName("trkseg")).toHaveLength(1);
  });
});

describe("one track through every leg, with a waypoint per section, including elevations", () => {
  it("exports a hike leg and a paddle leg as one track with their routed geometry", async () => {
    let trip = edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "setLegMode", index: 1, mode: "paddle" });
    // The fake router answers by mode; give each mode a distinct geometry.
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 300), paddle: routedBetween(P1, P2, 150) });
    const { gpx } = exported(trip);

    expect(gpx.tracks).toHaveLength(1);
    expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – hike", "2 – paddle", "End"]);
    // Coordinates may be rounded for the file; 1e-6 degrees is about 10 cm.
    const expected = [...routedGeometry(trip, 0), ...routedGeometry(trip, 1).slice(1)];
    const points = gpx.tracks[0].points;
    expect(points).toHaveLength(expected.length);
    points.forEach((point, j) => {
      expect(point.lat).toBeCloseTo(expected[j].lat, 6);
      expect(point.lon).toBeCloseTo(expected[j].lng, 6);
      expect(point.ele).toBeCloseTo(expected[j].elevation, 1);
    });
    // The paddle section's waypoint is where the hike's geometry ends, on the track.
    expect(gpx.waypoints[1]).toEqual({ ...points[2], name: "2 – paddle" });
  });

  it("joins consecutive same-mode legs into one section, uses an en dash and numbers sections from 1 in trip order", async () => {
    const trip = edit(emptyTrip(), add(P0), add(P1), add(P2), add(P3), { type: "setLegMode", index: 2, mode: "paddle" });
    const { gpx } = exported(trip);
    expect(gpx.waypoints).toEqual([
      { lat: P0.lat, lon: P0.lng, name: "1 – hike" },
      { lat: P2.lat, lon: P2.lng, name: "2 – paddle" },
      { lat: P3.lat, lon: P3.lng, name: "End" },
    ]);
    expect(gpx.waypoints[0].name).toContain("–");
    // The track runs P0 → P1 → P2 → P3 with each point written once.
    expect(gpx.tracks[0].points).toEqual([
      { lat: P0.lat, lon: P0.lng },
      { lat: P1.lat, lon: P1.lng },
      { lat: P2.lat, lon: P2.lng },
      { lat: P3.lat, lon: P3.lng },
    ]);
  });

  it("exports unrouted, pending or failed legs as straight lines between their points without elevation", async () => {
    const drawn = edit(emptyTrip(), add(P0), add(P1), add(P2));
    // Hike legs fail (no-route): the fake router has no hike result.
    const failed = await routeAll(drawn, {});
    expect(failed.legs.every((l) => l.route?.status === "failed")).toBe(true);
    const pending: Trip = { ...drawn, legs: drawn.legs.map((l) => ({ ...l, route: { status: "pending" } })) };

    for (const trip of [drawn, failed, pending]) {
      const { gpx, text } = exported(trip);
      expect(gpx.tracks[0].points).toEqual([
        { lat: P0.lat, lon: P0.lng },
        { lat: P1.lat, lon: P1.lng },
        { lat: P2.lat, lon: P2.lng },
      ]);
      expect(text).not.toContain("<ele>");
    }
  });

  it("mixes routed and failed legs in one trip", async () => {
    let trip = edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "setLegMode", index: 1, mode: "paddle" });
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 200) }); // paddle fails
    const points = exported(trip).gpx.tracks[0].points;
    expect(points).toHaveLength(4);
    expect(points.slice(0, 3).every((p) => typeof p.ele === "number")).toBe(true);
    expect(points[3]).toEqual({ lat: P2.lat, lon: P2.lng });
  });

  it("has no file for a trip without legs", () => {
    for (const trip of [emptyTrip(), edit(emptyTrip(), add(P0))]) expect(tripToGpx(trip, names)).toBeUndefined();
  });
});

describe("camps start a section, whose waypoint names its day", () => {
  it("starts a section at each camp and names the sections' waypoints with their day", async () => {
    let trip = edit(
      emptyTrip(),
      add(P0),
      add(P1),
      add(P2),
      add(P3),
      { type: "toggleCamp", index: 2 },
      { type: "toggleCamp", index: 1 },
    );
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 100) });
    const { gpx } = exported(trip);
    expect(gpx.waypoints.map((w) => w.name)).toEqual(["1 – Day 1 – hike", "2 – Day 2 – hike", "3 – Day 3 – hike", "End"]);
    expect(gpx.tracks).toHaveLength(1);
  });

  it("follows camp edits: an unmarked camp starts nothing and adds no day", () => {
    const trip = edit(
      emptyTrip(),
      add(P0),
      add(P1),
      add(P2),
      { type: "toggleCamp", index: 1 },
      { type: "toggleCamp", index: 1 },
    );
    expect(exported(trip).gpx.waypoints.map((w) => w.name)).toEqual(["1 – hike", "End"]);
  });

  it("follows point edits: a camp moves with its point and survives deleting an earlier point", () => {
    const moved = { lat: 50.2, lng: 5.5 };
    const trip = edit(
      emptyTrip(),
      add(P0),
      add(P1),
      add(P2),
      add(P3),
      { type: "toggleCamp", index: 2 },
      { type: "movePoint", index: 2, to: moved },
      { type: "deletePoint", index: 1 },
    );
    const { gpx } = exported(trip);
    expect(gpx.waypoints).toHaveLength(3);
    expect(gpx.waypoints[1]).toEqual({ lat: moved.lat, lon: moved.lng, name: "2 – Day 2 – hike" });
    expect(gpx.tracks[0].points[1]).toEqual({ lat: moved.lat, lon: moved.lng });
  });
});

describe("trip name in metadata and file name (story 39)", () => {
  it("Writes the trip name into the metadata and the track, and names the file after it", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Ourthe weekend");
    const { gpx, fileName } = exported(trip);
    expect(gpx.metadataName).toBe("Ourthe weekend");
    expect(gpx.tracks[0].name).toBe("Ourthe weekend");
    expect(fileName).toBe("Ourthe weekend.gpx");
  });

  it("uses 'Untitled trip' for an unnamed or blank-named trip", () => {
    expect(strings.tripNamePlaceholder).toBe("Untitled trip");
    for (const name of ["", "   "]) {
      const { gpx, fileName } = exported(renameTrip(edit(emptyTrip(), add(P0), add(P1)), name));
      expect(gpx.metadataName).toBe("Untitled trip");
      expect(fileName).toBe("Untitled trip.gpx");
    }
  });

  it("escapes &, <, >, quotes and keeps accents in the XML", () => {
    const name = `Tom & Jerry's <"Sûre"> trip é ü ç ø`;
    const { text } = exported(renameTrip(edit(emptyTrip(), add(P0), add(P1)), name));
    // Reads back exactly through a strict XML parser.
    const metadataName = xml(text).getElementsByTagName("metadata")[0].getElementsByTagName("name")[0].textContent;
    expect(metadataName).toBe(name);
    expect(parseGpx11(text).metadataName).toBe(name);
    // No raw markup characters leaked into the document.
    expect(text).not.toContain("Tom & Jerry");
    expect(text).not.toContain('<"Sûre">');
  });

  it("makes the GPX file name safe on Windows, macOS and Linux and keeps accents", () => {
    const { fileName } = exported(renameTrip(edit(emptyTrip(), add(P0), add(P1)), `Sûre: "a/b" <c> | d? *e\\f`));
    expect(fileName).toMatch(/\.gpx$/);
    expect(fileName).not.toMatch(/[/\\:*?"<>|\u0000-\u001f]/);
    expect(fileName).toContain("Sûre");
  });

  it("falls back to 'Untitled trip' when the name is only unsafe characters", () => {
    expect(exported(renameTrip(edit(emptyTrip(), add(P0), add(P1)), "///")).fileName).not.toBe(".gpx");
  });

  it("Names the GPX file like the save file, with .gpx instead of the save extension", () => {
    expect(exported(renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Lesse & Lomme")).fileName).toBe("Lesse & Lomme.gpx");
  });
});

describe("edge cases: the file stays valid GPX 1.1 for any trip the app accepts", () => {
  it("stays well-formed XML when the trip name holds a control character (e.g. from an opened file)", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Bell\u0007 trip");
    const { text, fileName } = exported(trip);
    expect(() => parseGpx11(text)).not.toThrow();
    // XML 1.0 forbids these characters even when escaped; xmldom is lenient, so check directly.
    expect(text).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    expect(fileName).not.toMatch(/[\u0000-\u001f]/);
  });

  it("writes longitudes within -180 <= lon < 180 after rounding, also just below 180", () => {
    const trip = edit(emptyTrip(), add({ lat: 10, lng: 179.99999999 }), add({ lat: 10.1, lng: 180 }));
    const lons = [...exported(trip).text.matchAll(/lon="([^"]+)"/g)].map((m) => Number(m[1]));
    // Updated: ADR 0037. Two track points and two waypoints (the start and the end).
    expect(lons).toHaveLength(4);
    for (const lon of lons) expect(lon >= -180 && lon < 180).toBe(true);
  });
});
