// Acceptance tests for #41 (ADR 0021, GLOSSARY "Section") written
// from the issue and the ADR. Seam: the trip planner core's pure functions
// (tripSections, tripToGpxFiles) and the app's day totals from #8 (summarise).
// Updated: ADR 0037. The export is one file: one track through the whole trip and
// a waypoint where each section starts (plus the end). The sections are unchanged;
// tests on the files now check the waypoints and the one track ("Updated: ADR 0037").
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { strings } from "../ui/strings";
import { tripToGpx, type GpxNames } from "./gpx";
import { tripSections } from "./sections";
import { summarise } from "./summarise";
import type { LegMode, Trip } from "./trip";

const names: GpxNames = {
  untitledTrip: strings.tripNamePlaceholder,
  section: strings.gpxSectionName,
  end: strings.gpxEnd,
};

/** A trip with one unrouted leg per mode, points along a line, and the given camps. */
function trip(modes: LegMode[], camps: number[] = [], name = "Ourthe"): Trip {
  const points = Array.from({ length: modes.length + 1 }, (_, i) => ({
    lat: 50 + i / 100,
    lng: 5 + i / 100,
  }));
  return {
    name,
    points,
    legs: modes.map((mode) => ({ mode })),
    ...(camps.length ? { camps } : {}),
  };
}

/** A routed trip: leg i runs through `perLeg` points, with elevations. */
function routedTrip(modes: LegMode[], camps: number[] = [], perLeg = 4): Trip {
  const base = trip(modes, camps);
  const legs = base.legs.map((leg, i) => {
    const a = base.points[i];
    const b = base.points[i + 1];
    const geometry = Array.from({ length: perLeg }, (_, k) => ({
      lat: a.lat + ((b.lat - a.lat) * k) / (perLeg - 1),
      lng: a.lng + ((b.lng - a.lng) * k) / (perLeg - 1),
      elevation: 100 + i * 10 + k,
    }));
    return { ...leg, route: { status: "routed", geometry } };
  });
  return { ...base, legs } as unknown as Trip;
}

const compact = (t: Trip) =>
  tripSections(t).map((s) => `${s.mode}:${s.firstLeg}-${s.lastLeg}:d${s.day}`);
/** The export's text (the trip has legs). */
function gpxOf(t: Trip): string {
  const file = tripToGpx(t, names);
  if (!file) throw new Error("no GPX for this trip");
  return file.text;
}
/** The names of the export's waypoints: one per section, then the end. */
const waypointNames = (t: Trip) => parseGpx11(gpxOf(t)).waypoints.map((w) => w.name);

function strictXml(text: string) {
  return new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`);
    },
  }).parseFromString(text, "text/xml");
}

describe("#41 AC1: sections split per ADR 0021", () => {
  it("single leg: one section", () => {
    expect(compact(trip(["paddle"]))).toEqual(["paddle:0-0:d1"]);
    expect(waypointNames(trip(["paddle"]))).toEqual(["1 – paddle", "End"]);
  });

  it("alternating modes: a section per leg", () => {
    expect(compact(trip(["hike", "paddle", "hike", "paddle"]))).toEqual([
      "hike:0-0:d1",
      "paddle:1-1:d1",
      "hike:2-2:d1",
      "paddle:3-3:d1",
    ]);
  });

  it("consecutive same-mode legs: one section", () => {
    expect(
      compact(trip(["hike", "hike", "paddle", "paddle", "paddle"])),
    ).toEqual(["hike:0-1:d1", "paddle:2-4:d1"]);
  });

  it("camp in the middle of a same-mode run: splits it, next day", () => {
    expect(compact(trip(["paddle", "paddle", "paddle"], [2]))).toEqual([
      "paddle:0-1:d1",
      "paddle:2-2:d2",
    ]);
  });

  it("camp at a mode change: one split only, no empty section", () => {
    expect(compact(trip(["hike", "hike", "paddle", "paddle"], [2]))).toEqual([
      "hike:0-1:d1",
      "paddle:2-3:d2",
    ]);
  });

  it("portage: paddle → hike → paddle gives three sections (Updated: ADR 0037: three section waypoints)", () => {
    expect(compact(trip(["paddle", "hike", "paddle"]))).toEqual([
      "paddle:0-0:d1",
      "hike:1-1:d1",
      "paddle:2-2:d1",
    ]);
    expect(waypointNames(trip(["paddle", "hike", "paddle"]))).toHaveLength(3 + 1);
  });

  it("trip ending on a camp point: no extra section, no extra day", () => {
    expect(compact(trip(["hike", "paddle"], [2]))).toEqual([
      "hike:0-0:d1",
      "paddle:1-1:d1",
    ]);
  });

  it("camp at the start point: splits nothing", () => {
    expect(compact(trip(["hike", "hike"], [0]))).toEqual(["hike:0-1:d1"]);
  });

  it("a camp on every point of a three-leg same-mode trip: three sections on days 1-3", () => {
    expect(compact(trip(["paddle", "paddle", "paddle"], [0, 1, 2, 3]))).toEqual(
      ["paddle:0-0:d1", "paddle:1-1:d2", "paddle:2-2:d3"],
    );
  });

  it("no legs: no sections, no file", () => {
    expect(tripSections(trip([]))).toEqual([]);
    expect(tripToGpx(trip([]), names)).toBeUndefined();
  });
});

describe("#41: day numbers in section names match the app's day totals (#8)", () => {
  // Every mode sequence of up to 5 legs and every camp set on its points.
  const cases: Trip[] = [];
  for (let n = 1; n <= 5; n += 1) {
    for (let modeBits = 0; modeBits < 1 << n; modeBits += 1) {
      const modes = Array.from(
        { length: n },
        (_, i) => ((modeBits >> i) & 1 ? "paddle" : "hike") as LegMode,
      );
      for (let campBits = 0; campBits < 1 << (n + 1); campBits += 1) {
        const camps = Array.from({ length: n + 1 }, (_, i) => i).filter(
          (i) => (campBits >> i) & 1,
        );
        cases.push(trip(modes, camps));
      }
    }
  }

  it(`each section lies within exactly one day, with that day's number (${cases.length} trips)`, () => {
    for (const t of cases) {
      const days = summarise(t).days;
      for (const section of tripSections(t)) {
        const day = days[section.day - 1];
        expect(day, JSON.stringify({ t: t.camps, section })).toBeDefined();
        expect(section.firstLeg).toBeGreaterThanOrEqual(day.firstLeg);
        expect(section.lastLeg).toBeLessThanOrEqual(day.lastLeg);
      }
      // The last section is on the trip's last day: no day number past the totals.
      expect(tripSections(t).at(-1)!.day).toBe(days.length);
    }
  });

  it("sections cover every leg exactly once, in order, and never mix modes", () => {
    for (const t of cases) {
      const sections = tripSections(t);
      let next = 0;
      for (const s of sections) {
        expect(s.firstLeg).toBe(next);
        for (let i = s.firstLeg; i <= s.lastLeg; i += 1)
          expect(t.legs[i].mode).toBe(s.mode);
        next = s.lastLeg + 1;
      }
      expect(next).toBe(t.legs.length);
    }
  });

  it("a section ends only at a mode change or an inner camp (no needless splits)", () => {
    for (const t of cases) {
      const sections = tripSections(t);
      for (let k = 1; k < sections.length; k += 1) {
        const boundary = sections[k].firstLeg;
        const modeChange = t.legs[boundary - 1].mode !== t.legs[boundary].mode;
        const camp = (t.camps ?? []).includes(boundary);
        expect(modeChange || camp).toBe(true);
      }
    }
  });
});

describe("#41 AC4, Updated: ADR 0037: naming", () => {
  it("without camps: section waypoints '<n> – <mode>'", () => {
    expect(waypointNames(trip(["hike", "paddle", "hike"]))).toEqual(["1 – hike", "2 – paddle", "3 – hike", "End"]);
  });

  it("with camps: '<n> – Day <d> – <mode>', n counting sections, d counting days", () => {
    expect(waypointNames(trip(["hike", "paddle", "paddle", "hike"], [2]))).toEqual([
      "1 – Day 1 – hike",
      "2 – Day 1 – paddle",
      "3 – Day 2 – paddle",
      "4 – Day 2 – hike",
      "End",
    ]);
  });

  it("unnamed or blank trip uses 'Untitled trip' for the file, metadata and track", () => {
    for (const name of ["", "   "]) {
      const file = tripToGpx(trip(["hike"], [], name), names)!;
      expect(file.fileName).toBe("Untitled trip.gpx");
      const gpx = parseGpx11(file.text);
      expect(gpx.metadataName).toBe("Untitled trip");
      expect(gpx.tracks[0].name).toBe("Untitled trip");
    }
  });

  it("names with characters illegal in file names: the inside name keeps the typed name, only the file name is made safe", () => {
    // Issue #41 / ADR 0021, amended 2026-10-12, kept by ADR 0037: metadata and track names
    // use the trip name as typed (XML-invalid characters removed); only the file name
    // replaces file-system-unsafe characters with "-".
    const cases: [string, string, string][] = [
      ["Lesse / Ourthe", "Lesse / Ourthe", "Lesse - Ourthe.gpx"],
      ["Semois: day trip", "Semois: day trip", "Semois- day trip.gpx"],
      ["A\u0007B", "AB", "A-B.gpx"],
      ['x\\y*z?"q"<r>|s', 'x\\y*z?"q"<r>|s', "x-y-z-q-r-s.gpx"],
    ];
    for (const [name, inside, fileName] of cases) {
      const file = tripToGpx(trip(["hike", "paddle"], [], name), names)!;
      expect(file.fileName, name).toBe(fileName);
      expect(file.fileName).not.toMatch(/[/\\:*?"<>|\u0000-\u001f]/);
      const gpx = parseGpx11(file.text);
      expect(gpx.metadataName, name).toBe(inside);
      expect(gpx.tracks[0].name, name).toBe(inside);
      expect(() => strictXml(file.text)).not.toThrow();
    }
  });
});

describe("#41 AC2 + AC3, Updated: ADR 0037: the GPX file", () => {
  const samples: [string, Trip][] = [
    [
      "routed mixed with camps",
      routedTrip(["hike", "paddle", "paddle", "hike", "paddle"], [3]),
    ],
    ["routed single leg", routedTrip(["paddle"])],
    ["unrouted", trip(["hike", "hike", "paddle"])],
  ];

  for (const [label, t] of samples) {
    it(`${label}: passes the strict GPX 1.1 checker with exactly one trk and one trkseg, a waypoint per section and the end`, () => {
      const text = gpxOf(t);
      const gpx = parseGpx11(text);
      expect(gpx.tracks).toHaveLength(1);
      expect(gpx.waypoints).toHaveLength(tripSections(t).length + 1);
      const doc = strictXml(text);
      expect(doc.getElementsByTagName("trk")).toHaveLength(1);
      expect(doc.getElementsByTagName("trkseg")).toHaveLength(1);
    });

    it(`${label}: points are continuous, with no point repeated where legs meet`, () => {
      const pts = parseGpx11(gpxOf(t)).tracks[0].points;
      for (let i = 1; i < pts.length; i += 1) {
        expect(
          pts[i].lat === pts[i - 1].lat && pts[i].lon === pts[i - 1].lon,
        ).toBe(false);
      }
    });

    it(`${label}: every waypoint lies on the track, in track order, the last at its end`, () => {
      const gpx = parseGpx11(gpxOf(t));
      const pts = gpx.tracks[0].points;
      let from = 0;
      for (const w of gpx.waypoints) {
        const at = pts.findIndex((p, i) => i >= from && p.lat === w.lat && p.lon === w.lon);
        expect(at, w.name).toBeGreaterThanOrEqual(from);
        from = at;
      }
      expect(from).toBe(pts.length - 1);
    });
  }

  it("the track holds every leg's geometry, joined once, with elevations", () => {
    const t = routedTrip(["paddle", "hike", "paddle"], [], 4);
    const pts = parseGpx11(gpxOf(t)).tracks[0].points;
    expect(pts).toHaveLength(4 + 3 + 3);
    expect(pts[0]).toMatchObject({
      lat: t.points[0].lat,
      lon: t.points[0].lng,
    });
    expect(pts.at(-1)).toMatchObject({
      lat: t.points[3].lat,
      lon: t.points[3].lng,
    });
    expect(pts.every((p) => typeof p.ele === "number")).toBe(true);
  });

  it("a section's waypoint is the point where the section before it ends", () => {
    const t = routedTrip(["hike", "paddle", "paddle"], [2]);
    const gpx = parseGpx11(gpxOf(t));
    expect(gpx.waypoints.map((w) => ({ lat: w.lat, lon: w.lon }))).toEqual(
      [0, 1, 2, 3].map((i) => ({ lat: t.points[i].lat, lon: t.points[i].lng })),
    );
  });

  it("keeps XML safety: control characters dropped, markup escaped, strict parser accepts it", () => {
    const name = `Tom & Jerry's <"Sûre">\u0001\u001f￾ trip`;
    const text = gpxOf(trip(["hike", "paddle"], [1], name));
    expect(() => strictXml(text)).not.toThrow();
    expect(() => parseGpx11(text)).not.toThrow();
    expect(parseGpx11(text).metadataName).toBe(`Tom & Jerry's <"Sûre"> trip`);
  });

  it("keeps coordinate bounds: lon 180 written as -180, latitudes clamped", () => {
    const t: Trip = {
      name: "Edge",
      points: [
        { lat: 90.00000004, lng: 179.99999999 },
        { lat: -95, lng: -181 },
      ],
      legs: [{ mode: "hike" }],
    };
    const gpx = parseGpx11(gpxOf(t));
    for (const p of [...gpx.tracks[0].points, ...gpx.waypoints]) {
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThan(180);
    }
  });
});
