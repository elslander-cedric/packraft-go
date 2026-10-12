// GPX export as a ZIP (#41, ADR 0021): one GPX file per section in one download.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { tripToGpxFiles, type GpxNames } from "@/core/gpx";
import type { Trip } from "@/core/trip";
import { parseGpx11 } from "@/testing/gpx11";
import { strings } from "@/ui/strings";
import { gpxZip } from "./tripFile";

const names: GpxNames = { untitledTrip: strings.tripNamePlaceholder, section: strings.gpxSectionName };

const points = [0, 1, 2, 3].map((i) => ({ lat: 50 + i / 100, lng: 5.5 }));
const portage: Trip = {
  name: "Lesse",
  points,
  legs: [{ mode: "paddle" }, { mode: "hike" }, { mode: "paddle" }],
};

describe("GPX ZIP", () => {
  it("holds every section's GPX file, by name, with the same text", () => {
    const entries = unzipSync(gpxZip(portage, names));
    const expected = tripToGpxFiles(portage, names);
    expect(Object.keys(entries)).toEqual(["Lesse – 1 – paddle.gpx", "Lesse – 2 – hike.gpx", "Lesse – 3 – paddle.gpx"]);
    for (const file of expected) {
      const text = strFromU8(entries[file.fileName]);
      expect(text).toBe(file.text);
      expect(parseGpx11(text).tracks).toHaveLength(1);
    }
  });

  it("holds one GPX file for a trip with one section", () => {
    const oneLeg: Trip = { name: "", points: points.slice(0, 2), legs: [{ mode: "hike" }] };
    expect(Object.keys(unzipSync(gpxZip(oneLeg, names)))).toEqual(["Untitled trip – 1 – hike.gpx"]);
  });
});
