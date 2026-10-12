// Acceptance tests for #41 (ADR 0021, GLOSSARY "Section"), written by the tester
// from the issue and the ADR. Seam: the trip planner core's pure functions
// (tripSections, tripToGpxFiles) and the app's day totals from #8 (summarise).
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "../testing/gpx11";
import { strings } from "../ui/strings";
import { tripToGpxFiles, type GpxNames } from "./gpx";
import { tripSections } from "./sections";
import { summarise } from "./summarise";
import type { LegMode, Trip } from "./trip";

const names: GpxNames = {
  untitledTrip: strings.tripNamePlaceholder,
  section: strings.gpxSectionName,
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
const fileNames = (t: Trip) => tripToGpxFiles(t, names).map((f) => f.fileName);

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
    expect(fileNames(trip(["paddle"]))).toEqual(["Ourthe – 1 – paddle.gpx"]);
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

  it("portage: paddle → hike → paddle gives three sections (three files)", () => {
    expect(compact(trip(["paddle", "hike", "paddle"]))).toEqual([
      "paddle:0-0:d1",
      "hike:1-1:d1",
      "paddle:2-2:d1",
    ]);
    expect(fileNames(trip(["paddle", "hike", "paddle"]))).toHaveLength(3);
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

  it("no legs: no sections, no files", () => {
    expect(tripSections(trip([]))).toEqual([]);
    expect(tripToGpxFiles(trip([]), names)).toEqual([]);
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

describe("#41 AC4: naming", () => {
  it("without camps: '<trip> – <n> – <mode>'", () => {
    expect(fileNames(trip(["hike", "paddle", "hike"]))).toEqual([
      "Ourthe – 1 – hike.gpx",
      "Ourthe – 2 – paddle.gpx",
      "Ourthe – 3 – hike.gpx",
    ]);
  });

  it("with camps: '<trip> – <n> – Day <d> – <mode>', n counting sections, d counting days", () => {
    expect(fileNames(trip(["hike", "paddle", "paddle", "hike"], [2]))).toEqual([
      "Ourthe – 1 – Day 1 – hike.gpx",
      "Ourthe – 2 – Day 1 – paddle.gpx",
      "Ourthe – 3 – Day 2 – paddle.gpx",
      "Ourthe – 4 – Day 2 – hike.gpx",
    ]);
  });

  it("unnamed or blank trip uses 'Untitled trip'", () => {
    for (const name of ["", "   "]) {
      expect(fileNames(trip(["hike"], [], name))).toEqual([
        "Untitled trip – 1 – hike.gpx",
      ]);
    }
  });

  it("metadata name and track name equal the file name without .gpx (ordinary names)", () => {
    for (const file of tripToGpxFiles(
      trip(["hike", "paddle"], [1], "Ourthe weekend"),
      names,
    )) {
      const gpx = parseGpx11(file.text);
      const base = file.fileName.replace(/\.gpx$/, "");
      expect(gpx.metadataName).toBe(base);
      expect(gpx.tracks[0].name).toBe(base);
    }
  });

  it("metadata name and track name equal the file name without .gpx, also for names with characters illegal in file names", () => {
    // Issue #41: "has metadata name and track name equal to the file name (without .gpx)".
    for (const name of ["Lesse / Ourthe", "Semois: day trip", "A\u0007B"]) {
      for (const file of tripToGpxFiles(
        trip(["hike", "paddle"], [], name),
        names,
      )) {
        expect(file.fileName).not.toMatch(/[/\\:*?"<>|\u0000-\u001f]/);
        const gpx = parseGpx11(file.text);
        const base = file.fileName.replace(/\.gpx$/, "");
        expect(gpx.metadataName, name).toBe(base);
        expect(gpx.tracks[0].name, name).toBe(base);
      }
    }
  });
});

describe("#41 AC2 + AC3: each GPX file", () => {
  const samples: [string, Trip][] = [
    [
      "routed mixed with camps",
      routedTrip(["hike", "paddle", "paddle", "hike", "paddle"], [3]),
    ],
    ["routed single leg", routedTrip(["paddle"])],
    ["unrouted", trip(["hike", "hike", "paddle"])],
  ];

  for (const [label, t] of samples) {
    it(`${label}: passes the strict GPX 1.1 checker with exactly one trk and one trkseg, no waypoints`, () => {
      for (const file of tripToGpxFiles(t, names)) {
        const gpx = parseGpx11(file.text);
        expect(gpx.tracks).toHaveLength(1);
        expect(gpx.waypoints).toEqual([]);
        const doc = strictXml(file.text);
        expect(doc.getElementsByTagName("trk")).toHaveLength(1);
        expect(doc.getElementsByTagName("trkseg")).toHaveLength(1);
        expect(doc.getElementsByTagName("wpt")).toHaveLength(0);
      }
    });

    it(`${label}: points are continuous, with no point repeated where legs meet`, () => {
      for (const file of tripToGpxFiles(t, names)) {
        const pts = parseGpx11(file.text).tracks[0].points;
        for (let i = 1; i < pts.length; i += 1) {
          expect(
            pts[i].lat === pts[i - 1].lat && pts[i].lon === pts[i - 1].lon,
          ).toBe(false);
        }
      }
    });
  }

  it("a routed multi-leg section holds every leg's geometry, joined once, with elevations", () => {
    const t = routedTrip(["paddle", "paddle", "paddle"], [], 4);
    const [file] = tripToGpxFiles(t, names);
    const pts = parseGpx11(file.text).tracks[0].points;
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

  it("adjacent sections share their boundary point (end of one = start of the next)", () => {
    const files = tripToGpxFiles(
      routedTrip(["hike", "paddle", "paddle"], [2]),
      names,
    );
    expect(files).toHaveLength(3);
    for (let i = 1; i < files.length; i += 1) {
      const prev = parseGpx11(files[i - 1].text).tracks[0].points.at(-1)!;
      const next = parseGpx11(files[i].text).tracks[0].points[0];
      expect({ lat: next.lat, lon: next.lon }).toEqual({
        lat: prev.lat,
        lon: prev.lon,
      });
    }
  });

  it("keeps XML safety: control characters dropped, markup escaped, strict parser accepts it", () => {
    const name = `Tom & Jerry's <"Sûre">\u0001\u001f￾ trip`;
    for (const file of tripToGpxFiles(
      trip(["hike", "paddle"], [1], name),
      names,
    )) {
      expect(() => strictXml(file.text)).not.toThrow();
      expect(() => parseGpx11(file.text)).not.toThrow();
      expect(parseGpx11(file.text).metadataName).toContain(
        `Tom & Jerry's <"Sûre"> trip`,
      );
    }
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
    const [file] = tripToGpxFiles(t, names);
    const pts = parseGpx11(file.text).tracks[0].points;
    for (const p of pts) {
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThan(180);
    }
  });
});
