// Acceptance tests for #11 (export as GPX), written by the tester from the
// issue, spec #2 (stories 39, 45-47) and ADR 0006. Seam 1: build trips with the
// core's public edits and a fake router, export them, and read the GPX back
// with a plain XML parser (plus the shared GPX 1.1 structure check).
// Updated: ADR 0021 (#41). The export is now one GPX file per section, each
// with one track and one segment, and camps are no longer waypoints. Tests that
// assumed one track per leg are replaced below and marked "Updated: ADR 0021".
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { strings } from "../ui/strings";
import { gpxZipFileName, tripToGpxFiles, type GpxNames } from "./gpx";
import type { RouteResult, RoutedPoint } from "./router";
import { createAutoRouter } from "./routing";
import { createFakeRouter } from "./testing/fakeRouter";
import { applyEdit, emptyTrip, renameTrip, type Edit, type LatLng, type Trip } from "./trip";

const names: GpxNames = { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName };

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

/** The export's files, each parsed with the GPX 1.1 structure check. */
const exported = (trip: Trip) => tripToGpxFiles(trip, names).map((file) => ({ ...file, gpx: parseGpx11(file.text) }));

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
    // Updated: ADR 0021. The export is a list of files; this trip has one section.
    const [file] = tripToGpxFiles(trip, names);
    const doc = xml(file.text);
    const root = doc.documentElement!;
    expect(root.localName).toBe("gpx");
    expect(root.namespaceURI).toBe("http://www.topografix.com/GPX/1/1");
    expect(root.getAttribute("version")).toBe("1.1");
    expect(root.getAttribute("creator")).toBeTruthy();
    expect(() => parseGpx11(file.text)).not.toThrow();
  });

  it("Updated: ADR 0021. Each file holds metadata then exactly one track, with no waypoints, also with camps", async () => {
    const trip = await routeAll(
      edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "toggleCamp", index: 1 }),
      { hike: routedBetween(P0, P1, 100) },
    );
    const files = tripToGpxFiles(trip, names);
    expect(files).toHaveLength(2);
    for (const file of files) {
      const order = [...(xml(file.text).documentElement!.childNodes as unknown as Node[])]
        .filter((n) => n.nodeType === 1)
        .map((n) => (n as Element).localName);
      expect(order).toEqual(["metadata", "trk"]);
      expect(xml(file.text).getElementsByTagName("trkseg")).toHaveLength(1);
    }
  });
});

describe("#11 AC2, Updated: ADR 0021: one file per section, named after it, including elevations", () => {
  it("exports a hike leg and a paddle leg as two files with their routed geometry", async () => {
    let trip = edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "setLegMode", index: 1, mode: "paddle" });
    // The fake router answers by mode; give each mode a distinct geometry.
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 300), paddle: routedBetween(P1, P2, 150) });
    const files = exported(trip);

    expect(files.map((f) => f.gpx.tracks[0].name)).toEqual(["Untitled trip – 1 – hike", "Untitled trip – 2 – paddle"]);
    for (const [i, file] of files.entries()) {
      expect(file.gpx.tracks).toHaveLength(1);
      // Coordinates may be rounded for the file; 1e-6 degrees is about 10 cm.
      const expected = routedGeometry(trip, i);
      const points = file.gpx.tracks[0].points;
      expect(points).toHaveLength(expected.length);
      points.forEach((point, j) => {
        expect(point.lat).toBeCloseTo(expected[j].lat, 6);
        expect(point.lon).toBeCloseTo(expected[j].lng, 6);
        expect(point.ele).toBeCloseTo(expected[j].elevation, 1);
      });
    }
  });

  it("joins consecutive same-mode legs into one file, uses an en dash and numbers sections from 1 in trip order", async () => {
    const trip = edit(emptyTrip(), add(P0), add(P1), add(P2), add(P3), { type: "setLegMode", index: 2, mode: "paddle" });
    const files = exported(trip);
    expect(files.map((f) => f.gpx.tracks[0].name)).toEqual(["Untitled trip – 1 – hike", "Untitled trip – 2 – paddle"]);
    expect(files[0].gpx.tracks[0].name).toContain("–");
    // The hike section runs P0 → P1 → P2 with P1 written once.
    expect(files[0].gpx.tracks[0].points).toEqual([
      { lat: P0.lat, lon: P0.lng },
      { lat: P1.lat, lon: P1.lng },
      { lat: P2.lat, lon: P2.lng },
    ]);
  });

  it("exports unrouted, pending or failed legs as straight lines between their points without elevation", async () => {
    const drawn = edit(emptyTrip(), add(P0), add(P1), add(P2));
    // Hike legs fail (no-route): the fake router has no hike result.
    const failed = await routeAll(drawn, {});
    expect(failed.legs.every((l) => l.route?.status === "failed")).toBe(true);
    const pending: Trip = { ...drawn, legs: drawn.legs.map((l) => ({ ...l, route: { status: "pending" } })) };

    for (const trip of [drawn, failed, pending]) {
      const files = exported(trip);
      expect(files).toHaveLength(1);
      expect(files[0].gpx.tracks[0].points).toEqual([
        { lat: P0.lat, lon: P0.lng },
        { lat: P1.lat, lon: P1.lng },
        { lat: P2.lat, lon: P2.lng },
      ]);
      expect(files[0].text).not.toContain("<ele>");
    }
  });

  it("mixes routed and failed legs in one trip", async () => {
    let trip = edit(emptyTrip(), add(P0), add(P1), add(P2), { type: "setLegMode", index: 1, mode: "paddle" });
    trip = await routeAll(trip, { hike: routedBetween(P0, P1, 200) }); // paddle fails
    const [hike, paddle] = exported(trip);
    expect(hike.gpx.tracks[0].points).toHaveLength(3);
    expect(hike.gpx.tracks[0].points.every((p) => typeof p.ele === "number")).toBe(true);
    expect(paddle.gpx.tracks[0].points).toEqual([
      { lat: P1.lat, lon: P1.lng },
      { lat: P2.lat, lon: P2.lng },
    ]);
  });

  it("has no files for a trip without legs", () => {
    for (const trip of [emptyTrip(), edit(emptyTrip(), add(P0))]) expect(tripToGpxFiles(trip, names)).toEqual([]);
  });
});

describe("#11 AC3, Updated: ADR 0021: camps split sections and add the day, instead of being waypoints", () => {
  it("ends a section at each camp and names sections with their day", async () => {
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
    const files = exported(trip);
    expect(files.map((f) => f.gpx.tracks[0].name)).toEqual([
      "Untitled trip – 1 – Day 1 – hike",
      "Untitled trip – 2 – Day 2 – hike",
      "Untitled trip – 3 – Day 3 – hike",
    ]);
    for (const file of files) expect(file.gpx.waypoints).toEqual([]);
  });

  it("follows camp edits: an unmarked camp splits nothing and adds no day", () => {
    const trip = edit(
      emptyTrip(),
      add(P0),
      add(P1),
      add(P2),
      { type: "toggleCamp", index: 1 },
      { type: "toggleCamp", index: 1 },
    );
    expect(exported(trip).map((f) => f.gpx.tracks[0].name)).toEqual(["Untitled trip – 1 – hike"]);
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
    const files = exported(trip);
    expect(files).toHaveLength(2);
    expect(files[0].gpx.tracks[0].points.at(-1)).toEqual({ lat: moved.lat, lon: moved.lng });
    expect(files[1].gpx.tracks[0].points[0]).toEqual({ lat: moved.lat, lon: moved.lng });
  });
});

describe("#11: trip name in metadata and file name (story 39)", () => {
  it("Updated: ADR 0021. Writes the section's name, starting with the trip name, into the metadata; the ZIP is named after the trip", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Ourthe weekend");
    const [file] = exported(trip);
    expect(file.gpx.metadataName).toBe("Ourthe weekend – 1 – hike");
    expect(file.fileName).toBe("Ourthe weekend – 1 – hike.gpx");
    expect(gpxZipFileName(trip, names.untitledTrip)).toBe("Ourthe weekend.zip");
  });

  it("uses 'Untitled trip' for an unnamed or blank-named trip", () => {
    expect(strings.tripNamePlaceholder).toBe("Untitled trip");
    for (const name of ["", "   "]) {
      const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), name);
      const [file] = exported(trip);
      expect(file.gpx.metadataName).toBe("Untitled trip – 1 – hike");
      expect(gpxZipFileName(trip, names.untitledTrip)).toBe("Untitled trip.zip");
    }
  });

  it("escapes &, <, >, quotes and keeps accents in the XML", () => {
    const name = `Tom & Jerry's <"Sûre"> trip é ü ç ø`;
    const [{ text }] = tripToGpxFiles(renameTrip(edit(emptyTrip(), add(P0), add(P1)), name), names);
    // Reads back exactly through a strict XML parser.
    const metadataName = xml(text).getElementsByTagName("metadata")[0].getElementsByTagName("name")[0].textContent;
    expect(metadataName).toBe(`${name} – 1 – hike`);
    expect(parseGpx11(text).metadataName).toBe(`${name} – 1 – hike`);
    // No raw markup characters leaked into the document.
    expect(text).not.toContain("Tom & Jerry");
    expect(text).not.toContain('<"Sûre">');
  });

  it("makes the ZIP and GPX file names safe on Windows, macOS and Linux and keeps accents", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), `Sûre: "a/b" <c> | d? *e\\f`);
    for (const fileName of [gpxZipFileName(trip, names.untitledTrip), tripToGpxFiles(trip, names)[0].fileName]) {
      expect(fileName).toMatch(/\.(zip|gpx)$/);
      expect(fileName).not.toMatch(/[/\\:*?"<>|\u0000-\u001f]/);
      expect(fileName).toContain("Sûre");
    }
  });

  it("falls back to 'Untitled trip' when the name is only unsafe characters", () => {
    expect(gpxZipFileName(renameTrip(emptyTrip(), "///"), names.untitledTrip)).not.toBe(".zip");
  });

  it("names the ZIP file like the save file, with .zip instead of the save extension", () => {
    const trip = renameTrip(emptyTrip(), "Lesse & Lomme");
    expect(gpxZipFileName(trip, names.untitledTrip)).toBe("Lesse & Lomme.zip");
  });
});

describe("#11 AC1 edge cases: the file stays valid GPX 1.1 for any trip the app accepts", () => {
  it("stays well-formed XML when the trip name holds a control character (e.g. from an opened file)", () => {
    const trip = renameTrip(edit(emptyTrip(), add(P0), add(P1)), "Bell\u0007 trip");
    for (const { text, fileName } of tripToGpxFiles(trip, names)) {
      expect(() => parseGpx11(text)).not.toThrow();
      // XML 1.0 forbids these characters even when escaped; xmldom is lenient, so check directly.
      expect(text).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
      expect(fileName).not.toMatch(/[\u0000-\u001f]/);
    }
  });

  it("writes longitudes within -180 <= lon < 180 after rounding, also just below 180", () => {
    const trip = edit(emptyTrip(), add({ lat: 10, lng: 179.99999999 }), add({ lat: 10.1, lng: 180 }));
    const lons = tripToGpxFiles(trip, names).flatMap(({ text }) => [...text.matchAll(/lon="([^"]+)"/g)].map((m) => Number(m[1])));
    expect(lons).toHaveLength(2);
    for (const lon of lons) expect(lon >= -180 && lon < 180).toBe(true);
  });
});
