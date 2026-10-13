// The Walloon stretch preparation (#54), tested on saved OSM extracts (fixtures/),
// never on live OSM. Expected positions come from outside OSM where possible
// (the research spot checks in docs/research/walloon-stretches.md §3).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStretches, endsNeedingReview, type AnnexRow, type DraftStretch, type ReviewDecisions } from "./build";
import { distanceM, project, type Pt } from "./geo";
import type { OverpassResult } from "./overpass";
import { STRETCH_RECIPES } from "./recipes";
import { RIVERS } from "./rivers";

const annex: AnnexRow[] = JSON.parse(
  readFileSync(path.join(__dirname, "../../../docs/research/data/walloon-stretches.json"), "utf8"),
);
const fixture = (name: string): { river: OverpassResult; border: OverpassResult } =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", `${name}.json`), "utf8"));

function build(river: string, extract: string, ids: string[], review?: ReviewDecisions) {
  const { river: data, border } = fixture(extract);
  return buildStretches({
    annex,
    rivers: RIVERS,
    recipes: STRETCH_RECIPES.filter((r) => ids.includes(r.id)),
    osm: { rivers: { [river]: data }, border },
    review,
  });
}

const byId = (stretches: DraftStretch[], id: string) => {
  const found = stretches.find((s) => s.id === id);
  if (!found) throw new Error(`no stretch ${id}`);
  return found;
};
const first = (s: DraftStretch): Pt => ({ lng: s.line[0][0], lat: s.line[0][1] });
const last = (s: DraftStretch): Pt => ({ lng: s.line[s.line.length - 1][0], lat: s.line[s.line.length - 1][1] });

describe("Warche below Robertville dam (1C1a)", () => {
  const { stretches, problems } = build("Warche", "warche", ["1C1a"]);
  const warche = byId(stretches, "1C1a");

  it("starts at the Robertville dam found in OSM, confidently", () => {
    expect(problems).toEqual([]);
    expect(warche.from.status).toBe("confident");
    expect(warche.from.reason).toMatch(/Barrage de Robertville/);
    // Nominatim spot check in the research: 50.45255, 6.10950.
    expect(distanceM(warche.from.point, { lat: 50.45255, lng: 6.1095 })).toBeLessThan(150);
  });

  it("ends at the Warche mouth, which Annex 1 doesn't state, so it needs review", () => {
    expect(warche.to.status).toBe("needsReview");
    expect(warche.to.reason).toMatch(/Annex 1 gives no end/);
    expect(warche.to.reason).toMatch(/mouth/);
  });

  it("draws the line along the river, downstream from start to end", () => {
    expect(warche.line.length).toBeGreaterThan(20);
    expect(distanceM(first(warche), warche.from.point)).toBeLessThan(2);
    expect(distanceM(last(warche), warche.to.point)).toBeLessThan(2);
    // Robertville to Malmedy along the Warche is roughly 15–20 km.
    expect(warche.lengthKm).toBeGreaterThan(12);
    expect(warche.lengthKm).toBeLessThan(25);
  });

  it("keeps the Annex data: category, thresholds and gauge", () => {
    expect(warche).toMatchObject({ category: "1.C", river: "Warche", annex2Gauge: "Malmedy", minM3s: null, maxM3s: 8.9 });
  });
});

describe("lower Lesse (1B2a, 1B2b, 1B2c, 1A2)", () => {
  const ids = ["1A2", "1B2a", "1B2b", "1B2c"];
  const { stretches } = build("Lesse", "lower-lesse", ids);

  it("ends 1A2 at the Meuse confluence at Anseremme, confidently", () => {
    const s = byId(stretches, "1A2");
    expect(s.to.status).toBe("confident");
    expect(s.to.reason).toMatch(/Meuse/);
    expect(distanceM(s.to.point, { lat: 50.2398, lng: 4.9124 })).toBeLessThan(150);
  });

  it("flags the ambiguous 'first fixed weir' for review, at a weir on the Lesse, not on the Meuse", () => {
    const s = byId(stretches, "1A2");
    expect(s.from.status).toBe("needsReview");
    // The Barrage de Waulsort on the Meuse lies about 100 m from the Lesse mouth: it must not be picked.
    expect(distanceM(s.from.point, { lat: 50.23788, lng: 4.90907 })).toBeGreaterThan(300);
  });

  it("puts 1B2a's start 100 m upstream of the Houyet road bridge", () => {
    const s = byId(stretches, "1B2a");
    const houyetBridge = { lat: 50.19032, lng: 5.00773 };
    expect(distanceM(s.from.point, houyetBridge)).toBeGreaterThan(70);
    expect(distanceM(s.from.point, houyetBridge)).toBeLessThan(130);
    expect(s.from.reason).toMatch(/100 m upstream/);
  });

  it("joins neighbouring stretches at one shared point, reviewed only once", () => {
    const b = byId(stretches, "1B2b");
    const c = byId(stretches, "1B2c");
    expect(c.from.point).toEqual(b.to.point);
    expect(c.from.sameAs).toBe("1B2b.to");
    const toReview = endsNeedingReview(stretches);
    expect(toReview).toContain("1B2b.to");
    expect(toReview).not.toContain("1B2c.from");
  });
});

describe("Viroin, the whole river (1B3)", () => {
  const { stretches, problems } = build("Viroin", "viroin", ["1B3"]);
  const viroin = byId(stretches, "1B3");
  const { border } = fixture("viroin");
  const borderWays = border.elements.map((e) =>
    (e.geometry ?? []).flatMap((p) => (p ? [{ lat: p.lat, lng: p.lon }] : [])),
  );

  it("ends where the river crosses the national border", () => {
    expect(problems).toEqual([]);
    const nearest = Math.min(...borderWays.map((way) => project(way, viroin.to.point).distance));
    expect(nearest).toBeLessThan(5);
  });

  it("needs review at both ends, because Annex 1 states neither", () => {
    expect(viroin.from.status).toBe("needsReview");
    expect(viroin.to.status).toBe("needsReview");
    expect(viroin.from.reason).toMatch(/whole Viroin/);
  });
});

describe("review decisions", () => {
  const plain = byId(build("Warche", "warche", ["1C1a"]).stretches, "1C1a");

  it("a confirmed point becomes reviewed and stays where it was", () => {
    const { stretches } = build("Warche", "warche", ["1C1a"], {
      "1C1a.to": { action: "confirm", lat: plain.to.point.lat, lng: plain.to.point.lng },
    });
    const s = byId(stretches, "1C1a");
    expect(s.to.status).toBe("reviewed");
    expect(s.to.point).toEqual(plain.to.point);
    expect(endsNeedingReview(stretches)).toEqual([]);
  });

  it("a moved point is snapped onto the river, and the line is cut there", () => {
    // About 1 km upstream of the mouth, a little off the river.
    const offRiver = { lat: plain.to.point.lat + 0.006, lng: plain.to.point.lng + 0.012 };
    const { stretches } = build("Warche", "warche", ["1C1a"], {
      "1C1a.to": { action: "move", lat: offRiver.lat, lng: offRiver.lng, note: "take-out above Malmedy" },
    });
    const s = byId(stretches, "1C1a");
    expect(s.to.status).toBe("reviewed");
    expect(s.to.reason).toMatch(/take-out above Malmedy/);
    expect(distanceM(s.to.point, plain.to.point)).toBeGreaterThan(200);
    expect(distanceM(last(s), s.to.point)).toBeLessThan(2);
    expect(s.lengthKm).toBeLessThan(plain.lengthKm);
  });

  it("a confirmed point that OSM has since moved needs review again", () => {
    const { stretches } = build("Warche", "warche", ["1C1a"], {
      "1C1a.to": { action: "confirm", lat: plain.to.point.lat + 0.01, lng: plain.to.point.lng },
    });
    const s = byId(stretches, "1C1a");
    expect(s.to.status).toBe("needsReview");
    expect(s.to.reason).toMatch(/Confirmed in review, but OSM now puts it/);
  });
});
