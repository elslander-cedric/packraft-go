// The offline preparation of the SPW snapshots (ADR 0035): turns answers from the
// PKAYAK map service into the datasets shipped in src/access/data/. Pure; the
// network calls are in scripts/prepare-spw-data.mts. To add a layer: a build
// function here, and an entry in that script's list.
import type { AccessSource } from "@/core/access";
import type { AccessPointUse } from "@/core/accessPoints";
import { dateInBrussels, type CalendarDate } from "@/core/calendarDate";
import type { ObstacleKind } from "@/core/obstacle";
import { simplify } from "@/dataprep/walloonStretches/geo";
import {
  OBSTACLE_DATA_FORMAT,
  OFFICIAL_AIRE_DATA_FORMAT,
  OFFICIAL_STRETCH_DATA_FORMAT,
  SPW_ATTRIBUTION,
  type ObstacleDataset,
  type OfficialAireDataset,
  type OfficialStretchDataset,
  type StoredObstacle,
  type StoredOfficialAire,
} from "../dataset";

const PKAYAK = "https://geoservices3.wallonie.be/arcgis/rest/services/APP_KAYAK/PKAYAK/MapServer";
export const PKAYAK_LAYERS = { obstacles: 1, aires: 3, stretches: 5 } as const;

/** A query for every record of a layer: only the fields it names, in WGS84 GeoJSON. */
export function pkayakQuery(layer: number, fields: readonly string[]): string {
  const query = new URLSearchParams({
    where: "1=1",
    outFields: fields.join(","),
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  return `${PKAYAK}/${layer}/query?${query}`;
}

export const AIRE_FIELDS = ["numemb", "nomtro", "nomair", "typemb", "datmod"] as const;
export const STRETCH_FIELDS = ["nomtro", "adrtro"] as const;
export const OBSTACLE_FIELDS = ["id", "codico", "datmod"] as const;

/** What the service answers, loosely: nothing in it is trusted until checked here. */
export type PkayakAnswer = {
  readonly features: readonly {
    readonly geometry?: { readonly type?: string; readonly coordinates?: readonly unknown[] } | null;
    readonly properties: Readonly<Record<string, unknown>>;
  }[];
  readonly exceededTransferLimit?: boolean;
};

const featuresOf = (answer: PkayakAnswer, what: string) => {
  // The service caps an answer at 2000 records: a partial list must never ship.
  if (answer.exceededTransferLimit) throw new Error(`The ${what} answer was cut off by the service's record limit`);
  return answer.features;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** The SPW's type codes. `NA` is treated as both: its 2 records describe themselves as in-and-out. */
const AIRE_USES: Readonly<Record<string, AccessPointUse>> = { E: "put-in", D: "take-out", ED: "both", NA: "both" };

/**
 * The SPW's `codico` values the app shows as obstacles. The layer's legend lists many more
 * (bathing, camping, "Danger", "Obstacle temporaire"): one appearing in the data is a decision.
 */
export const OBSTACLE_KINDS: Readonly<Record<string, ObstacleKind>> = {
  "2": "dam",
  "15": "impassable",
  "8": "rocks",
  "21": "drossage",
  "22": "low-bridge",
};

const round = (value: number) => Math.round(value * 100000) / 100000;

function positionOf(geometry: PkayakAnswer["features"][number]["geometry"]): readonly [number, number] | null {
  const [lng, lat] = geometry?.type === "Point" ? (geometry.coordinates ?? []) : [];
  return typeof lng === "number" && typeof lat === "number" && Number.isFinite(lng) && Number.isFinite(lat)
    ? [round(lng), round(lat)]
    : null;
}

/** Each official stretch's line as prepared for the mapping to AGW records (#209). Never shipped in the app. */
export type OfficialLineDataset = {
  readonly attribution: string;
  readonly source: AccessSource;
  readonly snapshot: CalendarDate;
  readonly stretches: readonly { readonly id: string; readonly parts: readonly (readonly (readonly [number, number])[])[] }[];
};

/** Well below the 100 m that decides whether a river point is on a line. */
const LINE_TOLERANCE_M = 3;

const partsOf = (geometry: PkayakAnswer["features"][number]["geometry"]) => {
  const parts = geometry?.type === "LineString" ? [geometry.coordinates] : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
  return (parts ?? []) as readonly (readonly (readonly [number, number])[])[];
};

/** Each official stretch's line, from layer 5, thinned: what the mapping is checked against. */
export function buildOfficialLines(answer: PkayakAnswer, snapshot: CalendarDate): OfficialLineDataset {
  const stretches = featuresOf(answer, "stretch line").map(({ geometry, properties }) => {
    const id = text(properties.nomtro);
    if (id === null) throw new Error("A stretch has no id");
    const parts = partsOf(geometry).map((part) =>
      simplify(
        part.map(([lng, lat]) => ({ lat, lng })),
        LINE_TOLERANCE_M,
      ).map(({ lat, lng }): [number, number] => [round(lng), round(lat)]),
    );
    if (parts.length === 0) throw new Error(`Stretch ${id} has no line`);
    return { id, parts };
  });
  return {
    attribution: SPW_ATTRIBUTION,
    source: { title: "SPW, PKAYAK map service, stretches", url: `${PKAYAK}/${PKAYAK_LAYERS.stretches}` },
    snapshot,
    stretches: stretches.toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Each official stretch's id and name, from layer 5. Its line isn't shipped (ADR 0035). */
export function buildOfficialStretches(answer: PkayakAnswer, snapshot: CalendarDate): OfficialStretchDataset {
  const stretches = featuresOf(answer, "stretch").map(({ properties }) => {
    const id = text(properties.nomtro);
    if (id === null) throw new Error("A stretch has no id");
    const name = text(properties.adrtro);
    if (name === null) throw new Error(`Stretch ${id} has no name`);
    return { id, name };
  });
  stretches.forEach(({ id }, i) => {
    if (stretches.findIndex((s) => s.id === id) !== i) throw new Error(`Stretch ${id} appears twice`);
  });
  return {
    format: OFFICIAL_STRETCH_DATA_FORMAT,
    version: 1,
    id: "official-stretches",
    title: "Official stretches in Wallonia",
    attribution: SPW_ATTRIBUTION,
    source: { title: "SPW, PKAYAK map service, stretches", url: `${PKAYAK}/${PKAYAK_LAYERS.stretches}` },
    snapshot,
    stretches: stretches.toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}

/** The official aires, from layer 3. Fails on anything the app couldn't show truthfully. */
export function buildOfficialAires(
  answer: PkayakAnswer,
  { stretches }: Pick<OfficialStretchDataset, "stretches">,
  snapshot: CalendarDate,
): OfficialAireDataset {
  const known = new Set(stretches.map((s) => s.id));
  const aires = featuresOf(answer, "aire").map(({ geometry, properties }): StoredOfficialAire => {
    const number = properties.numemb;
    if (typeof number !== "number") throw new Error(`An aire has no number: ${JSON.stringify(properties)}`);
    const fail = (problem: string) => new Error(`Aire ${number}: ${problem}`);
    const use = AIRE_USES[String(properties.typemb)];
    if (use === undefined) throw fail(`unknown type ${JSON.stringify(properties.typemb)}`);
    const officialStretch = text(properties.nomtro);
    if (officialStretch === null || !known.has(officialStretch)) {
      throw fail(`unknown official stretch ${JSON.stringify(properties.nomtro)}`);
    }
    const name = text(properties.nomair);
    if (name === null) throw fail("no name");
    if (typeof properties.datmod !== "number") throw fail("no last-changed date");
    const position = positionOf(geometry);
    if (position === null) throw fail("no position");
    return { number, name, use, officialStretch, position, lastChanged: dateInBrussels(properties.datmod) };
  });
  aires.forEach(({ number }, i) => {
    if (aires.findIndex((a) => a.number === number) !== i) throw new Error(`Aire ${number} appears twice`);
  });
  return {
    format: OFFICIAL_AIRE_DATA_FORMAT,
    version: 1,
    id: "official-aires",
    title: "Official aires in Wallonia",
    attribution: SPW_ATTRIBUTION,
    source: { title: "SPW, PKAYAK map service, aires", url: `${PKAYAK}/${PKAYAK_LAYERS.aires}` },
    snapshot,
    aires: aires.toSorted((a, b) => a.number - b.number),
  };
}

/**
 * The obstacles, from layer 1. The kind comes from the code alone: the SPW's name fields
 * are inconsistent (the English one often just says "Barrage"), so the app's text is its own.
 */
export function buildObstacles(answer: PkayakAnswer, snapshot: CalendarDate): ObstacleDataset {
  const obstacles = featuresOf(answer, "obstacle").map(({ geometry, properties }): StoredObstacle => {
    const spwId = properties.id;
    if (typeof spwId !== "number") throw new Error(`An obstacle has no id: ${JSON.stringify(properties)}`);
    const fail = (problem: string) => new Error(`Obstacle ${spwId}: ${problem}`);
    const kind = OBSTACLE_KINDS[String(properties.codico)];
    if (kind === undefined) throw fail(`unknown code ${JSON.stringify(properties.codico)}`);
    if (typeof properties.datmod !== "number") throw fail("no last-changed date");
    const position = positionOf(geometry);
    if (position === null) throw fail("no position");
    return { spwId, kind, position, lastChanged: dateInBrussels(properties.datmod) };
  });
  obstacles.forEach(({ spwId }, i) => {
    if (obstacles.findIndex((o) => o.spwId === spwId) !== i) throw new Error(`Obstacle ${spwId} appears twice`);
  });
  return {
    format: OBSTACLE_DATA_FORMAT,
    version: 1,
    id: "obstacles",
    title: "Obstacles on Walloon rivers",
    attribution: SPW_ATTRIBUTION,
    source: { title: "SPW, PKAYAK map service, obstacles", url: `${PKAYAK}/${PKAYAK_LAYERS.obstacles}` },
    snapshot,
    obstacles: obstacles.toSorted((a, b) => a.spwId - b.spwId),
  };
}
