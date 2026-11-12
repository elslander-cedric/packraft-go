// Which official stretch each AGW record lies on (ADR 0035). Each record maps to at
// most one, so a record that spans two, or an official stretch and a long unlisted part,
// is cut at the boundary. The cut runs after the stretches are built, on their lines, so
// it needs no OSM data of its own. The mapping is written by hand and checked against the
// SPW's lines (docs/research/data/spw-stretch-lines.json) by the data tests.
import type { AnnexRow, DraftStretch, ReviewDecisions, StretchEnd } from "./build";
import { distanceM, lengthM, projectOntoLine, sliceLine, type Pt } from "./geo";

export type OfficialSplit = {
  /** The Annex row. Its pieces are `${id}-1` (upstream) and `${id}-2`. */
  id: string;
  /** Where the SPW's lines change, read from them: the point to confirm or move in review. */
  at: Pt;
  boundary: { fr: string; en: string };
  /** The official stretch of each piece, downstream; null where the SPW lists none. */
  pieces: readonly [string | null, string | null];
  /** Why the cut is here, shown on the review page. */
  why: string;
};

export type OfficialMapping = {
  /** Records that lie on one official stretch. A record in neither list has none. */
  whole: Readonly<Record<string, string>>;
  splits: readonly OfficialSplit[];
};

export const OFFICIAL_MAPPING: OfficialMapping = {
  whole: {
    "1A1": "AMBLEVE3",
    "1A2": "LESSE6-7",
    "1A3a": "OURTHE1",
    "1A3b": "OURTHE2",
    "1B1a": "AMBLEVE1",
    "1B2a": "LESSE5",
    "1B2c": "LESSE6-7",
    "1B3": "VIROIN",
    "1B4a": "SEMOIS2-3",
    "1B4b": "SEMOIS2-3",
    "1B4c": "SEMOIS2-3",
    "1C1b": "SALM",
    "1C2a": "LESSE2",
    "1C3": "HOUILLE",
    "1C4a": "SURE",
    "1C4b": "OUR",
    "1C5a": "AISNE",
    "1C5b": "OURTHEOCC",
    "1C5c": "OURTHEOR",
    "1C6a": "SEMOIS1",
    "1C6b": "VIERRE",
  },
  splits: [
    {
      id: "1A3c",
      at: { lat: 50.46606, lng: 5.57872 },
      boundary: { fr: "Comblain-au-Pont", en: "Comblain-au-Pont" },
      pieces: ["OURTHE3", null],
      why: 'The SPW\'s OURTHE3 line stops here, beside its aire 56 (Comblain "Pied de la Hé Kepenne"). The 33 km below it are on no SPW line.',
    },
    {
      id: "1A4",
      at: { lat: 49.80359, lng: 5.21537 },
      boundary: { fr: "pont de Linglé", en: "Linglé bridge" },
      pieces: ["SEMOIS2-3", "SEMOIS4-5"],
      why: "The SPW's SEMOIS2-3 line ends and SEMOIS4-5 starts here, beside its aire 15 (au pont de Linglé).",
    },
    {
      id: "1B2b",
      at: { lat: 50.21146, lng: 4.96328 },
      boundary: { fr: "gare de Gendron", en: "Gendron station" },
      pieces: ["LESSE5", "LESSE6-7"],
      why: "The SPW's LESSE5 line ends and LESSE6-7 starts here, between its aires 505 (Gendron gare, on LESSE5) and 34 (Gendron berge gauche, on LESSE6-7).",
    },
    {
      id: "1C2b",
      at: { lat: 50.16193, lng: 5.0586 },
      boundary: { fr: "pont de Gilbock, Wanlin", en: "Gilbock bridge, Wanlin" },
      pieces: [null, "LESSE4"],
      why: "The SPW's LESSE4 line starts here, at its aire 59 (Wanlin, au pont de Gilbock). The 16 km above it are on no SPW line.",
    },
  ],
};

const roundTo5Decimals = (x: number) => Math.round(x * 1e5) / 1e5;
const toPts = (line: DraftStretch["line"]): Pt[] => line.map(([lng, lat]) => ({ lat, lng }));
const toLine = (points: readonly Pt[]): DraftStretch["line"] =>
  points.map(({ lat, lng }) => [roundTo5Decimals(lng), roundTo5Decimals(lat)]);
const roundedKm = (metres: number) => Math.round(metres / 100) / 10;
const onStretch = (official: string | null | undefined) => (official ? { officialStretch: official } : {});

/** The end every record's boundary is reviewed under; the second piece's start points at it. */
const boundaryEnd = (id: string) => `${id}-1.to`;

/** The ends that are split boundaries: they ship while they wait for review. */
export const splitBoundaryEnds = (mapping: OfficialMapping = OFFICIAL_MAPPING): string[] =>
  mapping.splits.map((split) => boundaryEnd(split.id));

function splitIntoPieces(stretch: DraftStretch, split: OfficialSplit, review: ReviewDecisions): DraftStretch[] {
  const key = boundaryEnd(split.id);
  const decision = review[key];
  const river = toPts(stretch.line);
  const cut = projectOntoLine(river, decision ?? split.at);
  const length = lengthM(river);
  const [upper, lower] = [sliceLine(river, 0, cut.along), sliceLine(river, cut.along, length)];
  const at = { lat: roundTo5Decimals(cut.point.lat), lng: roundTo5Decimals(cut.point.lng) };
  const reason =
    decision?.action === "move"
      ? `Moved by review${decision.note ? `: ${decision.note}` : "."}`
      : `${decision ? "Confirmed by review. " : ""}${split.why}`;
  const boundary: StretchEnd = { ...split.boundary, point: at, status: decision ? "reviewed" : "needsReview", reason };
  return [
    {
      ...stretch,
      id: `${split.id}-1`,
      splitOf: split.id,
      to: boundary,
      line: toLine(upper),
      lengthKm: roundedKm(cut.along),
      ...onStretch(split.pieces[0]),
    },
    {
      ...stretch,
      id: `${split.id}-2`,
      splitOf: split.id,
      from: { ...boundary, sameAs: key },
      line: toLine(lower),
      lengthKm: roundedKm(length - cut.along),
      ...onStretch(split.pieces[1]),
    },
  ];
}

/** An end shared with a record now in pieces points at the piece that has it. */
function sharedEnd(end: StretchEnd, splits: readonly OfficialSplit[]): StretchEnd {
  const [id, which] = end.sameAs?.split(".") ?? [];
  if (!splits.some((split) => split.id === id)) {
    return end;
  }
  return { ...end, sameAs: `${id}-${which === "from" ? 1 : 2}.${which}` };
}

/** Gives every record its official stretch, cutting those that span two. */
export function splitAtOfficialBoundaries(
  stretches: readonly DraftStretch[],
  review: ReviewDecisions = {},
  mapping: OfficialMapping = OFFICIAL_MAPPING,
): DraftStretch[] {
  return stretches.flatMap((stretch) => {
    const split = mapping.splits.find((split) => split.id === stretch.id);
    const within = {
      ...stretch,
      from: sharedEnd(stretch.from, mapping.splits),
      to: sharedEnd(stretch.to, mapping.splits),
    };
    return split ? splitIntoPieces(within, split, review) : [{ ...within, ...onStretch(mapping.whole[stretch.id]) }];
  });
}

/** What the split and the shipped format add to a built stretch. */
const ADDED_FIELDS = ["gauge", "noGaugeNote", "source", "researchDate", "officialStretch", "splitOf"];
const withoutAddedFields = <T extends object>(stretch: T) =>
  Object.fromEntries(Object.entries(stretch).filter(([field]) => !ADDED_FIELDS.includes(field))) as Omit<
    DraftStretch,
    "annex2Gauge"
  >;

/**
 * The records as they were before the cut, from a shipped dataset: what the split
 * needs, so a boundary can be reviewed and cut again with no OSM data.
 */
export function rejoinSplits(
  shipped: readonly (Omit<DraftStretch, "annex2Gauge"> & {
    gauge?: unknown;
    noGaugeNote?: string;
    source?: string;
    researchDate?: string;
  })[],
  annex: readonly Pick<AnnexRow, "id" | "annex2Gauge">[],
): DraftStretch[] {
  const records = new Map<string, DraftStretch>();
  for (const piece of shipped) {
    const id = piece.splitOf ?? piece.id;
    const stretch = withoutAddedFields(piece);
    const before = records.get(id);
    records.set(
      id,
      before
        ? {
            ...before,
            to: stretch.to,
            line: [...before.line, ...stretch.line.slice(1)],
            lengthKm: roundedKm((before.lengthKm + stretch.lengthKm) * 1000),
          }
        : { ...stretch, id, annex2Gauge: annex.find((row) => row.id === id)?.annex2Gauge ?? null },
    );
  }
  return [...records.values()];
}

/** How far from an SPW line a river point still counts as on it (the research's measure). */
export const NEAR_OFFICIAL_LINE_M = 100;
const SAMPLE_M = 50;
const M_PER_DEG = 111_320;
/** Comfortably more than NEAR_OFFICIAL_LINE_M, in either direction at these latitudes. */
const MARGIN_DEG = 0.003;

export type OfficialLines = Readonly<Record<string, readonly (readonly Pt[])[]>>;
export type OfficialRun = { official: string | null; fromKm: number; toKm: number };

const toSegment = (point: Pt, pointA: Pt, pointB: Pt) => {
  const metresPerDegreeLng = Math.cos((point.lat * Math.PI) / 180);
  const [ax, ay] = [(pointA.lng - point.lng) * metresPerDegreeLng, pointA.lat - point.lat];
  const [dx, dy] = [(pointB.lng - pointA.lng) * metresPerDegreeLng, pointB.lat - pointA.lat];
  const len2 = dx * dx + dy * dy;
  const fraction = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + fraction * dx, ay + fraction * dy) * M_PER_DEG;
};

type BoxedPart = { id: string; points: readonly Pt[]; south: number; north: number; west: number; east: number };

const withBoundingBoxes = (lines: OfficialLines): BoxedPart[] =>
  Object.entries(lines).flatMap(([id, parts]) =>
    parts.map((points) => {
      const lats = points.map((point) => point.lat);
      const lngs = points.map((point) => point.lng);
      return {
        id,
        points,
        south: Math.min(...lats) - MARGIN_DEG,
        north: Math.max(...lats) + MARGIN_DEG,
        west: Math.min(...lngs) - MARGIN_DEG,
        east: Math.max(...lngs) + MARGIN_DEG,
      };
    }),
  );

function nearestOfficial(point: Pt, parts: readonly BoxedPart[]): string | null {
  let best: string | null = null;
  let bestM: number = NEAR_OFFICIAL_LINE_M;
  for (const { id, points, south, north, west, east } of parts) {
    // Skip the far parts cheaply: the rivers here run to thousands of segments.
    if (point.lat < south || point.lat > north || point.lng < west || point.lng > east) {
      continue;
    }
    for (let i = 1; i < points.length; i++) {
      const metres = toSegment(point, points[i - 1]!, points[i]!);
      if (metres < bestM) {
        [best, bestM] = [id, metres];
      }
    }
  }
  return best;
}

/** The parts of a line that follow each SPW line, downstream, including those on none (null). */
export function officialRuns(line: readonly Pt[], lines: OfficialLines): OfficialRun[] {
  const parts = withBoundingBoxes(lines);
  const runs: OfficialRun[] = [];
  let along = 0;
  for (let i = 1; i < line.length; i++) {
    const [pointA, pointB] = [line[i - 1]!, line[i]!];
    const span = distanceM(pointA, pointB);
    const steps = Math.max(1, Math.ceil(span / SAMPLE_M));
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps;
      const official = nearestOfficial(
        {
          lat: pointA.lat + fraction * (pointB.lat - pointA.lat),
          lng: pointA.lng + fraction * (pointB.lng - pointA.lng),
        },
        parts,
      );
      const metres = along + fraction * span;
      const last = runs.at(-1);
      if (last?.official === official) {
        continue;
      }
      if (last) {
        last.toKm = metres / 1000;
      }
      runs.push({ official, fromKm: metres / 1000, toKm: metres / 1000 });
    }
    along += span;
  }
  const last = runs.at(-1);
  if (last) {
    last.toKm = along / 1000;
  }
  return runs;
}

/** The kilometres of a line on each SPW line, and on none (under the key "none"). */
export function kmByOfficial(runs: readonly OfficialRun[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const { official, fromKm, toKm } of runs) {
    totals[official ?? "none"] = (totals[official ?? "none"] ?? 0) + toKm - fromKm;
  }
  return totals;
}

/** Below these a difference is noise between two surveys of one river, not worth a reader's time. */
const NOTE_OTHER_KM = 0.2;
const NOTE_UNLISTED_KM = 2;

/** What a reviewer should weigh: where the mapping and the SPW's lines don't quite agree. */
export function mappingNotes(
  stretches: readonly Pick<DraftStretch, "id" | "line" | "officialStretch">[],
  lines: OfficialLines,
): string[] {
  return stretches.flatMap(({ id, line, officialStretch }) => {
    const totals = kmByOfficial(officialRuns(toPts(line), lines));
    return Object.entries(totals).flatMap(([official, length]) => {
      const onIt = `${length.toFixed(1)} km`;
      if (official === officialStretch) {
        return [];
      }
      if (official === "none") {
        return officialStretch && length >= NOTE_UNLISTED_KM
          ? [`${id} (${officialStretch}): ${onIt} on no SPW line`]
          : [];
      }
      if (length < NOTE_OTHER_KM) {
        return [];
      }
      return [`${id} (${officialStretch ?? "no official stretch"}): ${onIt} on the SPW's ${official} line`];
    });
  });
}
