// Turns the reviewed Walloon stretch dataset (#54, src/data/walloon-stretches.json)
// into access records for the core (#59, ADR 0024). Season, fishing days and
// hours follow from the category (AGW art. 4) in the core; this only maps data.
import type { AccessRecord } from "@/core/access";
import type { AgwCategory } from "@/core/agw";
import { OSM_ATTRIBUTION, ACCESS_DATA_FORMAT, type AccessDataset } from "./dataset";

/** The part of the stretch dataset's format (version 1) that the access layer reads. */
export type WalloonStretchData = {
  readonly researchDate: string;
  readonly sources: { readonly annex1: string };
  readonly stretches: readonly {
    readonly id: string;
    readonly category: AgwCategory;
    readonly river: string;
    readonly from: { readonly en: string };
    readonly to: { readonly en: string };
    readonly line: readonly (readonly [number, number])[];
    readonly gauge: { readonly name: string; readonly stationNo: string; readonly assumed: boolean } | null;
    readonly noGaugeNote?: string;
    readonly minM3s: number | null;
    readonly maxM3s: number;
    readonly note?: string;
    readonly researchDate: string;
  }[];
};

export const KAYAK_LINK = { title: "SPW: kayak status today", url: "https://kayak.spw.wallonie.be/" } as const;

/** What could not be confirmed for a stretch: an assumed gauge, an inferred row, or no gauge at all. */
function unverifiedOf(stretch: WalloonStretchData["stretches"][number]): string | undefined {
  const parts: string[] = [];
  if (stretch.gauge?.assumed) {
    parts.push(`The gauge ${stretch.gauge.name} is an assumed match to the Annex 2 row.`);
  }
  if (stretch.note?.includes("[UNVERIFIED]")) parts.push(stretch.note.replace("[UNVERIFIED]", "").trim());
  if (!stretch.gauge && stretch.noGaugeNote) parts.push(stretch.noGaugeNote);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function walloonDataset(data: WalloonStretchData): AccessDataset {
  const records: AccessRecord[] = data.stretches.map((stretch) => {
    const unverified = unverifiedOf(stretch);
    return {
      id: `walloon-${stretch.id}`,
      name: `${stretch.river}: ${stretch.from.en} to ${stretch.to.en} (${stretch.category})`,
      scope: "water",
      region: "wallonia",
      rule: {
        type: "agw",
        category: stretch.category,
        minM3s: stretch.minM3s,
        maxM3s: stretch.maxM3s,
        gauge: stretch.gauge && { ...stretch.gauge },
        link: KAYAK_LINK,
      },
      geometry: { type: "LineString", coordinates: stretch.line.map(([lng, lat]) => [lng, lat] as const) },
      source: { title: "AGW of 19 March 2009, Annex 1 and 2", url: data.sources.annex1 },
      researched: stretch.researchDate,
      ...(unverified && { unverified }),
    };
  });
  return {
    format: ACCESS_DATA_FORMAT,
    version: 1,
    id: "wallonia",
    title: "Walloon stretches (AGW Annex 1 and 2)",
    attribution: OSM_ATTRIBUTION,
    extracted: data.researchDate,
    records,
  };
}
