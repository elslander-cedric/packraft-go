// Bank spots (ADR 0039, GLOSSARY "Bank spot"): outside Wallonia, where an OSM path or road
// reaches the bank of open water, outside VMM agreement stretches. Allowed by the built-in
// access rules, but nobody has checked them on the ground. The rules below were tuned on the map.
import { recordsAt, regionsAt, evaluateRecord, type AccessRules } from "@/core/access";
import type { Position } from "@/core/geo";
import { distanceM, project, type Pt } from "../walloonStretches/geo";
import type { OverpassResult } from "../walloonStretches/overpass";
import type { Water } from "./waters";

/**
 * How far from a water's line a path or road may be and still reach its bank: OSM draws the
 * line mid-water, and a canal is wider than most rivers.
 */
export const BANK_M = { river: 30, canal: 50 } as const;
/** No two bank spots on one water are closer than this, as the crow flies. */
export const BANK_SPOT_SPACING_M = 4000;
/** VMM agreement stretches: you get in and out only at their own points, so no bank spots there. */
const VMM_AGREEMENT = /^flanders-vmm-/;
/** The size of the grid cells waters are found in, in degrees. */
const CELL_DEG = 0.02;

/** Where a bank spot lies on a water: on a canal, on both its ways. */
export type BankStation = { readonly water: string; readonly alongM: number };

export type BankSpot = {
  /** `bank-spot-<OSM node id>`. */
  readonly id: string;
  readonly position: Position;
  readonly stations: readonly BankStation[];
};

type Candidate = { readonly node: number; readonly point: Pt; readonly water: Water; readonly alongM: number; readonly onWater: Pt };

const cellOf = ({ lat, lng }: Pt) => `${Math.floor(lng / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`;

/** Each water by every grid cell it passes near, so a node is only measured against waters close to it. */
function waterGrid(waters: readonly Water[]): Map<string, Water[]> {
  const grid = new Map<string, Water[]>();
  for (const water of waters) {
    const cells = new Set<string>();
    for (const { lat, lng } of water.line) {
      for (const dLng of [-1, 0, 1]) {
        for (const dLat of [-1, 0, 1]) {
          cells.add(cellOf({ lat: lat + dLat * CELL_DEG, lng: lng + dLng * CELL_DEG }));
        }
      }
    }
    for (const cell of cells) grid.set(cell, [...(grid.get(cell) ?? []), water]);
  }
  return grid;
}

/** The water a path or road node reaches the bank of, if any: the nearest. */
function candidateAt(node: number, point: Pt, grid: ReadonlyMap<string, readonly Water[]>): Candidate | undefined {
  let best: (Candidate & { distance: number }) | undefined;
  for (const water of grid.get(cellOf(point)) ?? []) {
    const { along, distance, point: onWater } = project(water.line, point);
    if (distance <= BANK_M[water.canal ? "canal" : "river"] && (!best || distance < best.distance)) {
      best = { node, point, water, alongM: along, onWater, distance };
    }
  }
  return best;
}

/** Open water by the built-in access rules, whatever the date, outside Wallonia and VMM agreement stretches. */
function allowed(onWater: Pt, rules: AccessRules): boolean {
  if (regionsAt(onWater, rules).includes("wallonia")) return false;
  const records = recordsAt(onWater, rules);
  return (
    records.length > 0 &&
    records.every((record) => !VMM_AGREEMENT.test(record.id) && evaluateRecord(record, {}).state === "open")
  );
}

function stationsOf({ water, alongM }: Candidate, waters: readonly Water[]): BankStation[] {
  const back = waters.find((other) => other.reverseOf === water.id);
  const lengthM = water.line.slice(1).reduce((sum, point, i) => sum + distanceM(water.line[i], point), 0);
  const round = (value: number) => Math.round(value * 10) / 10;
  return [{ water: water.id, alongM: round(alongM) }, ...(back ? [{ water: back.id, alongM: round(lengthM - alongM) }] : [])];
}

/**
 * The bank spots on the waters: the path and road nodes in the Overpass answer (`bankWaterQuery` and `bankPathQuery`)
 * on a water's bank, on open water, each water's first one along it, then the next one at least
 * the spacing away from those picked, and so on.
 */
export function pickBankSpots(waters: readonly Water[], osm: OverpassResult, rules: AccessRules): BankSpot[] {
  const forward = waters.filter((water) => water.reverseOf === undefined);
  const grid = waterGrid(forward);
  const seen = new Set<number>();
  const candidates = osm.elements.flatMap((element) => {
    // The query's path and road nodes come without tags; dams, lock gates and weirs have theirs.
    if (element.type !== "node" || element.tags || element.lat === undefined || element.lon === undefined) return [];
    if (seen.has(element.id)) return [];
    seen.add(element.id);
    const found = candidateAt(element.id, { lat: element.lat, lng: element.lon }, grid);
    return found ? [found] : [];
  });
  candidates.sort(
    (a, b) => a.water.river.localeCompare(b.water.river) || a.water.id.localeCompare(b.water.id) || a.alongM - b.alongM,
  );
  const picked = new Map<string, Candidate[]>();
  const spots: BankSpot[] = [];
  for (const candidate of candidates) {
    const onRiver = picked.get(candidate.water.river) ?? [];
    if (onRiver.some((other) => distanceM(other.point, candidate.point) < BANK_SPOT_SPACING_M)) continue;
    // Both where you stand and the water in front of you.
    if (!allowed(candidate.onWater, rules) || !allowed(candidate.point, rules)) continue;
    picked.set(candidate.water.river, [...onRiver, candidate]);
    spots.push({
      id: `bank-spot-${candidate.node}`,
      position: [candidate.point.lng, candidate.point.lat],
      stations: stationsOf(candidate, waters),
    });
  }
  return spots;
}
