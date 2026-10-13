// Assembles the shipped Walloon stretch dataset (#54): built geometry plus gauges,
// source and research date on every record (spec #51, ADR 0024).
import type { DraftStretch } from "./build";

/** AGW Annex 2 gauge names mapped to KiWIS station numbers (docs/research/hydrometry.md §5). */
export const KIWIS_STATIONS: Readonly<Record<string, string>> = {
  Stavelot: "6732",
  Martinrive: "6621",
  Malmedy: "6933",
  "Trois-Ponts": "6832",
  Daverdisse: "8341",
  Gendron: "8221",
  Jemelle: "8527",
  Gedinne: "L6400",
  Treignes: "9021",
  Martelange: "L5610",
  Reuland: "9914",
  Nisramont: "5991",
  Durbuy: "5953",
  Tabreux: "5921",
  Houffalize: "L5930",
  Amberloup: "L6290",
  Erezée: "L6690",
  Tintigny: "9561",
  Chiny: "9541",
  Membre: "9434",
  Martilly: "L7130",
};

/** The most likely station, not a confirmed one (ADR 0024; Martinrive and Gendron added 2026-10-13). */
export const ASSUMED_GAUGES: readonly string[] = ["Martelange", "Membre", "Martinrive", "Gendron"];

/** Annex 2 gauges with no KiWIS station: flow status is unknown (ADR 0024). */
export const GAUGES_WITHOUT_STATION: Readonly<Record<string, string>> = {
  Wanlin:
    "Annex 2 names the Wanlin gauge, but KiWIS has no Wanlin station on the Lesse, so flow status is unknown. Season and hours still apply.",
};

export const RESEARCH_DATE = "2026-10-12";

export const SOURCES = {
  annex1: "https://wallex.wallonie.be/files/medias/0/6393.pdf",
  annex2: "https://wallex.wallonie.be/files/medias/0/6394.pdf",
  geometry: "OpenStreetMap contributors (ODbL), prepared offline by scripts/walloon-stretches",
};

export type Gauge = { name: string; stationNo: string; assumed: boolean };

export type ShippedStretch = Omit<DraftStretch, "annex2Gauge"> & {
  gauge: Gauge | null;
  noGaugeNote?: string;
  source: string;
  researchDate: string;
};

export type WalloonStretchDataset = {
  dataset: "walloon-stretches";
  formatVersion: 1;
  researchDate: string;
  /** Who reviewed the uncertain end points, and when (the review page, #54). */
  review?: { reviewedBy: string; reviewedAt: string; decisions: number };
  credit: string;
  licence: string;
  sources: typeof SOURCES;
  stretches: ShippedStretch[];
};

export function toDataset(
  stretches: readonly DraftStretch[],
  review?: { reviewedBy: string; reviewedAt: string; decisions: number },
): WalloonStretchDataset {
  return {
    dataset: "walloon-stretches",
    formatVersion: 1,
    researchDate: RESEARCH_DATE,
    ...(review ? { review } : {}),
    credit: "© OpenStreetMap contributors; AGW 19 March 2009, Annexes 1 and 2",
    licence: "Geometry derived from OpenStreetMap data, ODbL 1.0",
    sources: SOURCES,
    stretches: stretches.map(({ annex2Gauge, ...rest }) => {
      const name = annex2Gauge ?? "";
      const stationNo = KIWIS_STATIONS[name];
      return {
        ...rest,
        gauge: stationNo ? { name, stationNo, assumed: ASSUMED_GAUGES.includes(name) } : null,
        ...(stationNo ? {} : { noGaugeNote: GAUGES_WITHOUT_STATION[name] ?? `No KiWIS station for the ${name} gauge.` }),
        source: `AGW 19 March 2009, Annex 1 (${SOURCES.annex1}) and Annex 2 (${SOURCES.annex2}); geometry © OpenStreetMap contributors`,
        researchDate: RESEARCH_DATE,
      };
    }),
  };
}
