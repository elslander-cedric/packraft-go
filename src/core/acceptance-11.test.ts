// Acceptance tests for #11 (export as GPX), written by the tester from the
// issue, spec #2 (stories 39, 45-47) and ADR 0006. Seam 1: build trips with the
// core's public edits and a fake router, export them, and read the GPX back
// with a plain XML parser (plus the shared GPX 1.1 structure check).
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { strings } from "../ui/strings";
import { gpxFileName, tripToGpx, type GpxNames } from "./gpx";
import type { RouteResult, RoutedPoint } from "./router";
import { createAutoRouter } from "./routing";
import { createFakeRouter } from "./testing/fakeRouter";
import { applyEdit, emptyTrip, renameTrip, type Edit, type LatLng, type Trip } from "./trip";

const names: GpxNames = {
  untitledTrip: strings.tripNamePlaceholder,
  leg: strings.gpxTrackName,
  camp: strings.gpxCampName,
};

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
  const auto = createAutoRouter(createFakeRouter(results), (change) => (current = change(current)));
  await auto.sync(current);
  return current;
}

const routedGeometry = (trip: Trip, leg: number): readonly RoutedPoint[] => {
  const route = trip.legs[leg].route;
  if (route?.status !== "routed") throw new Error(`leg ${leg} is not routed`);
  return route.geometry;
};

/** Parses with a strict XML parser that throws on any error, returning the document. */
function xml(text: string) {
  return new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(message);
    },
  }).parseFromString(text, "application/xml");
}

describe("#11 AC1: export produces valid GPX 1.1", () => {
  it("is well-formed XML with a GPX 1.1 root, namespace, version and creator", async () => {
    const trip = await routeAll(edit(renameTrip(emptyTrip(), "Ourthe"), add(P0), add(P1)), {
      hike: routedBetween(P0, P1, 100),
    });
    const text = tripToGpx(trip, names);
    const doc = xml(text);
    const root = doc.documentElement!;
    expect(root.localName).toBe("gpx");
    expect(root.namespaceURI).toBe("http://www.topografix.com/GPX/1/1");
    expect(root.getAttribute("version")).toBe("1.1");
    expect(root.getAttribute("creator")).toBeTruthy();
    expect(() => parseGpx11(text)).not.toThrow();
  });

  it("puts waypoints before tracks, as the GPX 1.1 schema requires", async () => {
    const trip = await routeAll(
      edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "toggleCamp", index: 1 }),
      { hike: routedBetween(P0, P1, 100) },
    );
    const order = [...(xml(tripToGpx(trip, names)).documentElement!.childNodes as unknown as Node[])]
      .filter((n) => n.nodeType === 1)
      .map((n) => (n as Element).localName);
    expect(order).toEqual(["metadata", "wpt", "trk", "trk"]);
  });
});

describe("#11 AC2: one track per leg, named with index and mode, including elevations", () => {
  it("exports a hike leg and a paddle leg as 'Leg 1 – hike' and 'Leg 2 – paddle' with their routed geometry", async () => {
    let trip = edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "setLegMode", index: 1, mode: "paddle" });
    // The fake router answers by mode; give each mode a distinct geometry.
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 300), paddle: routedBetween(P1, P2, 150) });
    const gpx = parseGpx11(tripToGpx(trip, names));

    expect(gpx.tracks.map((t) => t.name)).toEqual(["Leg 1 – hike", "Leg 2 – paddle"]);
    for (const [i, track] of gpx.tracks.entries()) {
      // Coordinates may be rounded for the file; 1e-6 degrees is about 10 cm.
      const expected = routedGeometry(trip, i);
      expect(track.points).toHaveLength(expected.length);
      track.points.forEach((point, j) => {
        expect(point.lat).toBeCloseTo(expected[j].lat, 6);
        expect(point.lon).toBeCloseTo(expected[j].lng, 6);
        expect(point.ele).toBeCloseTo(expected[j].elevation, 1);
      });
    }
  });

  it("uses an en dash in track names and numbers legs from 1 in trip order", async () => {
    const trip = edit(emptyTrip(), add(P0), add(P1), add(P2), add(P3), { type: "setLegMode", index: 2, mode: "paddle" });
    const gpx = parseGpx11(tripToGpx(trip, names));
    expect(gpx.tracks.map((t) => t.name)).toEqual(["Leg 1 – hike", "Leg 2 – hike", "Leg 3 – paddle"]);
    expect(gpx.tracks[2].name).toContain("–");
  });

  it("exports an unrouted, pending or failed leg as a straight line between its points without elevation", async () => {
    const drawn = edit(emptyTrip(), add(P0), add(P1), add(P2));
    // Hike legs fail (no-route): the fake router has no hike result.
    const failed = await routeAll(drawn, {});
    expect(failed.legs.every((l) => l.route?.status === "failed")).toBe(true);
    const pending: Trip = { ...drawn, legs: drawn.legs.map((l) => ({ ...l, route: { status: "pending" } })) };

    for (const trip of [drawn, failed, pending]) {
      const gpx = parseGpx11(tripToGpx(trip, names));
      expect(gpx.tracks).toHaveLength(2);
      expect(gpx.tracks[0].points).toEqual([
        { lat: P0.lat, lon: P0.lng },
        { lat: P1.lat, lon: P1.lng },
      ]);
      expect(gpx.tracks[1].points).toEqual([
        { lat: P1.lat, lon: P1.lng },
        { lat: P2.lat, lon: P2.lng },
      ]);
      expect(tripToGpx(trip, names)).not.toContain("<ele>");
    }
  });

  it("mixes routed and failed legs in one trip", async () => {
    let trip = edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "setLegMode", index: 1, mode: "paddle" });
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 200) }); // paddle fails
    const gpx = parseGpx11(tripToGpx(trip, names));
    expect(gpx.tracks[0].points).toHaveLength(3);
    expect(gpx.tracks[0].points.every((p) => typeof p.ele === "number")).toBe(true);
    expect(gpx.tracks[1].points).toEqual([
      { lat: P1.lat, lon: P1.lng },
      { lat: P2.lat, lon: P2.lng },
    ]);
  });

  it("has no tracks for a trip without legs", () => {
    for (const trip of [emptyTrip(), edit(emptyTrip(), add(P0))]) {
      const gpx = parseGpx11(tripToGpx(trip, names));
      expect(gpx.tracks).toEqual([]);
    }
  });
});

describe("#11 AC3: camps exported as named waypoints", () => {
  it("exports each camp as 'Camp N' at its point, numbered along the trip", async () => {
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
    const gpx = parseGpx11(tripToGpx(trip, names));
    expect(gpx.waypoints.map(({ name, lat, lon }) => ({ name, lat, lon }))).toEqual([
      { name: "Camp 1", lat: P1.lat, lon: P1.lng },
      { name: "Camp 2", lat: P2.lat, lon: P2.lng },
    ]);
  });

  it("follows camp edits: an unmarked camp is not exported", () => {
    const trip = edit(
      emptyTrip(),
      add(P0),
      add(P1),
      add(P2),
      { type: "toggleCamp", index: 1 },
      { type: "toggleCamp", index: 1 },
    );
    expect(parseGpx11(tripToGpx(trip, names)).waypoints).toEqual([]);
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
    const gpx = parseGpx11(tripToGpx(trip, names));
    expect(gpx.waypoints).toEqual([{ name: "Camp 1", lat: moved.lat, lon: moved.lng }]);
    expect(gpx.tracks).toHaveLength(2);
  });
});

describe("#11: trip name in metadata and file name (story 39)", () => {
  it("writes the trip name into the metadata and names the file after it", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Ourthe weekend");
    expect(parseGpx11(tripToGpx(trip, names)).metadataName).toBe("Ourthe weekend");
    expect(gpxFileName(trip, names.untitledTrip)).toBe("Ourthe weekend.gpx");
  });

  it("uses 'Untitled trip' for an unnamed or blank-named trip", () => {
    expect(strings.tripNamePlaceholder).toBe("Untitled trip");
    for (const name of ["", "   "]) {
      const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), name);
      expect(parseGpx11(tripToGpx(trip, names)).metadataName).toBe("Untitled trip");
      expect(gpxFileName(trip, names.untitledTrip)).toBe("Untitled trip.gpx");
    }
  });

  it("escapes &, <, >, quotes and keeps accents in the XML", () => {
    const name = `Tom & Jerry's <"Sûre"> trip é ü ç ø`;
    const text = tripToGpx(renameTrip(edit(emptyTrip(), add(P0), add(P1)), name), names);
    // Reads back exactly through a strict XML parser.
    const metadataName = xml(text).getElementsByTagName("metadata")[0].getElementsByTagName("name")[0].textContent;
    expect(metadataName).toBe(name);
    expect(parseGpx11(text).metadataName).toBe(name);
    // No raw markup characters leaked into the document.
    expect(text).not.toContain("Tom & Jerry");
    expect(text).not.toContain('<"Sûre">');
  });

  it("makes the file name safe on Windows, macOS and Linux and keeps accents", () => {
    const fileName = gpxFileName(renameTrip(emptyTrip(), `Sûre: "a/b" <c> | d? *e\\f`), names.untitledTrip);
    expect(fileName.endsWith(".gpx")).toBe(true);
    expect(fileName).not.toMatch(/[/\\:*?"<>|\u0000-\u001f]/);
    expect(fileName).toContain("Sûre");
  });

  it("falls back to 'Untitled trip' when the name is only unsafe characters", () => {
    expect(gpxFileName(renameTrip(emptyTrip(), "///"), names.untitledTrip)).not.toBe(".gpx");
  });

  it("names the GPX file like the save file, with .gpx instead of the save extension", () => {
    const trip = renameTrip(emptyTrip(), "Lesse & Lomme");
    expect(gpxFileName(trip, names.untitledTrip)).toBe("Lesse & Lomme.gpx");
  });
});

describe("#11 AC1 edge cases: the file stays valid GPX 1.1 for any trip the app accepts", () => {
  it("stays well-formed XML when the trip name holds a control character (e.g. from an opened file)", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Bell\u0007 trip");
    const text = tripToGpx(trip, names);
    expect(() => parseGpx11(text)).not.toThrow();
    // XML 1.0 forbids these characters even when escaped; xmldom is lenient, so check directly.
    expect(text).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });

  it("writes longitudes within -180 <= lon < 180 after rounding, also just below 180", () => {
    const trip = edit(emptyTrip(), add({ lat: 10, lng: 179.99999999 }), add({ lat: 10.1, lng: 180 }));
    const lons = [...tripToGpx(trip, names).matchAll(/lon="([^"]+)"/g)].map((m) => Number(m[1]));
    expect(lons).toHaveLength(2);
    for (const lon of lons) expect(lon >= -180 && lon < 180).toBe(true);
  });
});
