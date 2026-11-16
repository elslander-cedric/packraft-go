// Bank spots (ADR 0039, GLOSSARY "Bank spot"), picked from a recorded Overpass answer for the
// Demer and the Dijle around Werchter (`bankWaterQuery` and `bankPathQuery`) and the built-in access rules.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { builtInAccessRules } from "@/access/builtInRules";
import type { AccessRecord, AccessRules } from "@/core/access";
import { distanceM, project } from "../walloonStretches/geo";
import type { OverpassResult } from "../walloonStretches/overpass";
import { BANK_SPOT_SPACING_M, pickBankSpots } from "./bankSpots";
import { watersFromOsm } from "./waters";

const werchter: OverpassResult = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "demer-werchter.json"), "utf8"));
const waters = watersFromOsm(werchter);
const watersById = new Map(waters.map((water) => [water.id, water]));
const spots = pickBankSpots(waters, werchter, builtInAccessRules);
const riverOf = (spot: (typeof spots)[number]) => watersById.get(spot.stations[0].water)!.river;
const pt = ([lng, lat]: readonly [number, number]) => ({ lat, lng });

/** The answer's whole area, as a polygon. */
const AROUND_WERCHTER: AccessRecord["geometry"] = {
  type: "Polygon",
  coordinates: [
    [
      [4.6, 50.9],
      [4.9, 50.9],
      [4.9, 51.05],
      [4.6, 51.05],
      [4.6, 50.9],
    ],
  ],
};

describe("bank spots", () => {
  it("are where a path or road reaches the Demer's bank, not on the Dijle's VMM agreement stretch", () => {
    expect(spots.filter((spot) => riverOf(spot) === "Demer").length).toBeGreaterThanOrEqual(2);
    expect(spots.filter((spot) => riverOf(spot) === "Dijle")).toEqual([]);
  });

  it("each lie on the bank of its water, at an OSM path or road node", () => {
    const nodes = new Map(werchter.elements.filter((element) => element.type === "node").map((node) => [node.id, node]));
    for (const spot of spots) {
      const node = nodes.get(Number(spot.id.replace("bank-spot-", "")));
      expect(node, spot.id).toBeDefined();
      expect(node?.tags, spot.id).toBeUndefined();
      expect(spot.position).toEqual([node?.lon, node?.lat]);
      for (const station of spot.stations) {
        const { distance, along } = project(watersById.get(station.water)!.line, pt(spot.position));
        expect(distance, spot.id).toBeLessThanOrEqual(50);
        expect(station.alongM).toBeCloseTo(along, 0);
      }
    }
  });

  it("are spaced along a water", () => {
    const demer = spots.filter((spot) => riverOf(spot) === "Demer");
    for (const [i, spot] of demer.entries()) {
      for (const other of demer.slice(i + 1)) {
        expect(distanceM(pt(spot.position), pt(other.position)), `${spot.id} ${other.id}`).toBeGreaterThanOrEqual(
          BANK_SPOT_SPACING_M,
        );
      }
    }
  });

  it("are never in Wallonia", () => {
    const rules: AccessRules = {
      records: builtInAccessRules.records.map((record) =>
        record.id === "wallonia" ? { ...record, geometry: AROUND_WERCHTER } : record,
      ),
    };
    expect(pickBankSpots(waters, werchter, rules)).toEqual([]);
  });

  it("are never on water that isn't open", () => {
    const demer = waters.filter((water) => water.river === "Demer");
    const closed: AccessRecord = {
      ...builtInAccessRules.records.find((record) => record.id === "flanders-lier-nete-diversion")!,
      id: "closed-demer",
      geometry: { type: "MultiLineString", coordinates: demer.map((water) => water.line.map(({ lng, lat }) => [lng, lat])) },
    };
    const rules: AccessRules = { records: [...builtInAccessRules.records, closed] };
    expect(pickBankSpots(waters, werchter, rules).filter((spot) => riverOf(spot) === "Demer")).toEqual([]);
  });
});
