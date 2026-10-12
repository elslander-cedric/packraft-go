// Acceptance tests for #41 (ADR 0021), written by the tester: the export is one
// valid ZIP holding one GPX file per section. Seam: gpxZip's bytes, read both
// with fflate and by walking the ZIP's central directory by hand.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { GpxNames } from "@/core/gpx";
import type { LegMode, Trip } from "@/core/trip";
import { parseGpx11 } from "@/testing/gpx11";
import { strings } from "@/ui/strings";
import { gpxZip } from "./tripFile";

const names: GpxNames = {
  untitledTrip: strings.tripNamePlaceholder,
  section: strings.gpxSectionName,
};

function trip(name: string, modes: LegMode[], camps: number[] = []): Trip {
  const points = Array.from({ length: modes.length + 1 }, (_, i) => ({
    lat: 50 + i / 100,
    lng: 5,
  }));
  return {
    name,
    points,
    legs: modes.map((mode) => ({ mode })),
    ...(camps.length ? { camps } : {}),
  };
}

type CentralEntry = { name: string; utf8Flag: boolean; method: number };

/** Reads the ZIP's end-of-central-directory record and its central directory entries. */
function centralDirectory(bytes: Uint8Array): CentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end of central directory record");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: CentralEntry[] = [];
  for (let k = 0; k < count; k += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("bad central directory entry");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    entries.push({ name, utf8Flag: (flags & 0x0800) !== 0, method });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("#41 AC5: one ZIP with one GPX per section", () => {
  it("is a well-formed ZIP: local header signature, central directory, entry count = section count", () => {
    const bytes = gpxZip(
      trip("Ourthe", ["hike", "paddle", "hike", "paddle"], [2]),
      names,
    );
    expect(
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true),
    ).toBe(0x04034b50);
    const entries = centralDirectory(bytes);
    expect(entries.map((e) => e.name)).toEqual([
      "Ourthe – 1 – Day 1 – hike.gpx",
      "Ourthe – 2 – Day 1 – paddle.gpx", // the camp at point 2 starts leg 2
      "Ourthe – 3 – Day 2 – hike.gpx",
      "Ourthe – 4 – Day 2 – paddle.gpx",
    ]);
    // Names hold an en dash, so the UTF-8 flag must be set for unzip tools to read them right.
    for (const e of entries) expect(e.utf8Flag).toBe(true);
  });

  it("each entry decompresses to GPX 1.1 with exactly one track", () => {
    const entries = unzipSync(
      gpxZip(trip("Ourthe", ["paddle", "hike", "paddle"]), names),
    );
    expect(Object.keys(entries)).toHaveLength(3);
    for (const bytes of Object.values(entries)) {
      const text = strFromU8(bytes);
      expect(parseGpx11(text).tracks).toHaveLength(1);
      expect(text.match(/<trkseg>/g)).toHaveLength(1);
    }
  });

  it("a single-section trip still gives a ZIP with one GPX", () => {
    expect(
      Object.keys(unzipSync(gpxZip(trip("", ["hike", "hike"]), names))),
    ).toEqual(["Untitled trip – 1 – hike.gpx"]);
  });

  it("names with characters illegal in file names give flat entries: no folders, no path traversal", () => {
    for (const name of [
      "Lesse / Ourthe",
      "..\\..\\evil",
      "../../etc/passwd",
      'a:b*c?"d"<e>|f',
    ]) {
      const entries = centralDirectory(
        gpxZip(trip(name, ["hike", "paddle"]), names),
      );
      expect(entries).toHaveLength(2);
      for (const e of entries) {
        expect(e.name, name).not.toMatch(/[/\\:*?"<>|]/);
        expect(e.name.endsWith(".gpx")).toBe(true);
      }
    }
  });

  it("entry names are unique even when two names differ only in unsafe characters", () => {
    const entries = centralDirectory(
      gpxZip(trip("a/b", ["hike", "paddle", "hike", "paddle"]), names),
    );
    expect(new Set(entries.map((e) => e.name)).size).toBe(4);
  });
});
