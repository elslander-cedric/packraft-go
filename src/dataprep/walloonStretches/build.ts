// Builds the Walloon stretch geometry from OSM extracts and the Annex 1/2 data (ADR 0024).
// Pure: the OSM answers, recipes and Cedric's review decisions are all passed in.
import {
  lineCrossings,
  distanceM,
  lengthM,
  pointAt,
  projectOntoLine,
  simplify,
  sliceLine,
  type Projection,
  type Pt,
} from "./geo";
import { mainStem } from "./mainStem";
import type { OverpassElement, OverpassResult } from "./overpass";
import type { EndRecipe, EndSpec, StretchRecipe } from "./recipes";
import { normaliseName, tagsMatch, type RiverConfig } from "./rivers";

/** One row of docs/research/data/walloon-stretches.json. */
export type AnnexRow = {
  id: string;
  annex1Ref: string;
  category: "1.A" | "1.B" | "1.C";
  subBasin: string;
  river: string;
  from: { fr: string; en: string };
  to: { fr: string; en: string };
  annex2Gauge: string | null;
  minM3s: number | null;
  maxM3s: number | null;
  note?: string;
};

/**
 * - `confident`: computed or found unambiguously in OSM.
 * - `needsReview`: a guess; Cedric must confirm or move it.
 * - `reviewed`: confirmed or moved by Cedric on the review page.
 */
export type EndStatus = "confident" | "needsReview" | "reviewed";

export type StretchEnd = {
  fr: string;
  en: string;
  point: Pt;
  status: EndStatus;
  /** Why the point is where it is, and why it needs review if it does. */
  reason: string;
  /** Set when this end is the same point as another stretch's end ("1A1.from"); review that one instead. */
  sameAs?: string;
};

export type DraftStretch = AnnexRow & {
  from: StretchEnd;
  to: StretchEnd;
  /** Along the river, downstream; [lng, lat] pairs like GeoJSON. */
  line: Array<[number, number]>;
  lengthKm: number;
  /** The SPW stretch it lies on, set by official.ts; absent where the SPW lists none. */
  officialStretch?: string;
  /** On a piece of a split record: the record's id, the Annex row's (several rows can share an annex1Ref). */
  splitOf?: string;
};

/** A review decision for one end, keyed "1A1.from". The position is always recorded. */
export type ReviewDecision = { action: "confirm" | "move"; lat: number; lng: number; note?: string };
export type ReviewDecisions = Record<string, ReviewDecision>;

export type OsmInput = { rivers: Record<string, OverpassResult>; border: OverpassResult };

export type BuildInput = {
  annex: readonly AnnexRow[];
  rivers: readonly RiverConfig[];
  recipes: readonly StretchRecipe[];
  osm: OsmInput;
  review?: ReviewDecisions;
};

/** A confirmed point is kept only while the computed point stays this close to it. */
export const CONFIRM_TOLERANCE_M = 30;
/** Features further than this from the river are not candidates. */
const NEAR_RIVER_M = 150;
/** A dam or weir this close to the river is on it. */
const ON_RIVER_M = 30;
/** A place this far from the river is not the one meant. */
const PLACE_MAX_M = 4000;
/** A confluence partner must reach this close to the river. */
const CONFLUENCE_MAX_M = 150;
/** Line simplification tolerance: well below what a map shows. */
const SIMPLIFY_M = 3;

type Feature = { names: string[]; tags: Record<string, string>; geometry: Pt[] };

const geometryOf = (overpassElement: OverpassElement): Pt[] =>
  overpassElement.type === "node" && overpassElement.lat !== undefined && overpassElement.lon !== undefined
    ? [{ lat: overpassElement.lat, lng: overpassElement.lon }]
    : (overpassElement.geometry ?? [])
        .filter((point): point is { lat: number; lon: number } => point !== null)
        .map((point) => ({ lat: point.lat, lng: point.lon }));

const featureOf = (overpassElement: OverpassElement): Feature => {
  const tags = overpassElement.tags ?? {};
  const names = ["name", "bridge:name", "alt_name", "official_name", "name:fr", "old_name"]
    .map((key) => tags[key])
    .filter((value): value is string => Boolean(value));
  return { names, tags, geometry: geometryOf(overpassElement) };
};

const namesInclude = (names: readonly string[], wanted: string) =>
  names.some((name) => normaliseName(name).includes(normaliseName(wanted)));

const formatMetres = (metres: number) =>
  metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;

type Located = { at: Projection; status: Exclude<EndStatus, "reviewed">; reason: string };

class RiverContext {
  readonly stem: Pt[];
  readonly features: Feature[];
  constructor(
    readonly config: RiverConfig,
    result: OverpassResult,
    readonly border: Pt[][],
  ) {
    this.features = result.elements.map(featureOf).filter((feature) => feature.geometry.length > 0);
    const ways = this.features
      .filter((feature) => feature.tags.waterway === "river" && tagsMatch(feature.tags, config.osmNames))
      .map((feature) => feature.geometry);
    this.stem = mainStem(ways);
  }

  nearest(feature: Feature): Projection {
    let best: Projection | undefined;
    for (const point of feature.geometry) {
      const pr = projectOntoLine(this.stem, point);
      if (!best || pr.distance < best.distance) {
        best = pr;
      }
    }
    return best!;
  }

  place(name: string): { feature: Feature; at: Projection } | undefined {
    const matches = this.features
      .filter(
        (feature) =>
          feature.tags.place && feature.names.some((otherName) => normaliseName(otherName) === normaliseName(name)),
      )
      .map((feature) => ({ feature, at: this.nearest(feature) }))
      .filter(({ at }) => at.distance <= PLACE_MAX_M)
      .sort((left, right) => left.at.distance - right.at.distance);
    return matches[0];
  }

  /** Candidates of a kind near the river, optionally filtered by name, ordered by distance to a place. */
  locateFeature(
    label: string,
    isKind: (f: Feature) => boolean,
    at: (f: Feature) => Projection | undefined,
    opts: { name?: string; road?: string; near?: string; hint?: Pt },
  ): Located | string {
    const candidates = this.features
      .filter(isKind)
      .map((feature) => ({ f: feature, at: at(feature) }))
      .filter(
        (candidate): candidate is { f: Feature; at: Projection } =>
          candidate.at !== undefined && candidate.at.distance <= NEAR_RIVER_M,
      );
    const anchor = opts.hint ?? (opts.near ? this.place(opts.near)?.feature.geometry[0] : undefined);
    const byAnchor = (left: { at: Projection }, right: { at: Projection }) =>
      anchor ? distanceM(left.at.point, anchor) - distanceM(right.at.point, anchor) : 0;
    const described = [opts.name && `"${opts.name}"`, opts.road && `on ${opts.road}`, opts.near && `near ${opts.near}`]
      .filter(Boolean)
      .join(" ");
    const named = candidates.filter(
      ({ f: feature }) =>
        (opts.name !== undefined && namesInclude(feature.names, opts.name)) ||
        (opts.road !== undefined &&
          feature.tags.name !== undefined &&
          normaliseName(feature.tags.name) === normaliseName(opts.road)),
    );
    if (named.length > 0) {
      named.sort(byAnchor);
      // Several ways of one structure (e.g. both carriageways) count as one find.
      const distinct = named.filter((candidate) => distanceM(candidate.at.point, named[0].at.point) > 60);
      const what = named[0].f.names[0] ?? label;
      if (distinct.length === 0) {
        return { at: named[0].at, status: "confident", reason: `OSM ${label} "${what}".` };
      }
      return {
        at: named[0].at,
        status: "needsReview",
        reason: `${named.length} OSM ${label}s match ${described}; picked "${what}"${anchor ? " nearest to it" : ""}.`,
      };
    }
    if (!anchor) {
      return `no OSM ${label} ${described} found`;
    }
    const near = candidates.filter((candidate) => distanceM(candidate.at.point, anchor) <= PLACE_MAX_M).sort(byAnchor);
    if (near.length === 0) {
      return `no OSM ${label} within ${formatMetres(PLACE_MAX_M)} of ${opts.near ?? "the hint"}`;
    }
    const what = near[0].f.names[0] ? `"${near[0].f.names[0]}"` : "an unnamed one";
    return {
      at: near[0].at,
      status: "needsReview",
      reason: `No ${label} named for it in OSM; picked ${what}, the nearest of ${near.length} to ${opts.near ?? "the hint"} (${formatMetres(distanceM(near[0].at.point, anchor))} away).`,
    };
  }

  locate(recipe: EndRecipe): Located | string {
    const { stem } = this;
    switch (recipe.kind) {
      case "riverStart":
        return {
          at: { along: 0, point: stem[0], distance: 0 },
          status: "confident",
          reason: "Start of the river's mapped course.",
        };
      case "riverEnd": {
        const along = lengthM(stem);
        return {
          at: { along, point: stem[stem.length - 1], distance: 0 },
          status: "confident",
          reason: "End of the river's mapped course (its mouth).",
        };
      }
      case "border": {
        const found = this.border.flatMap((way) => lineCrossings(stem, way));
        if (found.length === 0) {
          return "the river doesn't cross the national border in the OSM extract";
        }
        const last = found[found.length - 1];
        const spread = last.along - found[0].along;
        if (found.length === 1 || spread < 50) {
          return { at: last, status: "confident", reason: "Where the river crosses the national border." };
        }
        return {
          at: last,
          status: "needsReview",
          reason: `The river crosses the national border ${found.length} times (over ${formatMetres(spread)}); picked the last crossing.`,
        };
      }
      case "confluence": {
        const partners = this.features.filter(
          (feature) =>
            /^(river|stream|canal)$/.test(feature.tags.waterway ?? "") && tagsMatch(feature.tags, recipe.with),
        );
        // The partner either ends on this river (tributary) or this river ends on it (mouth).
        let best: Projection | undefined;
        for (const partner of partners) {
          for (const point of [partner.geometry[0], partner.geometry[partner.geometry.length - 1]]) {
            const pr = projectOntoLine(stem, point);
            if (!best || pr.distance < best.distance) {
              best = pr;
            }
          }
        }
        const mouth = stem[stem.length - 1];
        for (const partner of partners) {
          const pr = projectOntoLine(partner.geometry, mouth);
          if (pr.distance < (best?.distance ?? Infinity)) {
            best = { along: lengthM(stem), point: mouth, distance: pr.distance };
          }
        }
        if (!best) {
          return `no OSM waterway named ${recipe.with.join("/")} near the river`;
        }
        if (best.distance <= CONFLUENCE_MAX_M) {
          return { at: best, status: "confident", reason: `Confluence with the ${recipe.with[0]}.` };
        }
        return {
          at: best,
          status: "needsReview",
          reason: `The ${recipe.with[0]} comes no closer than ${formatMetres(best.distance)} to the river in OSM.`,
        };
      }
      case "dam": {
        const isDam = (feature: Feature) => feature.tags.waterway === "dam" || feature.tags.waterway === "weir";
        // Only dams and weirs on this river: not those on a river it flows into.
        const onRiver = (feature: Feature) => {
          const at = this.nearest(feature);
          return at.distance <= ON_RIVER_M ? at : undefined;
        };
        if (recipe.fromMouth) {
          const all = this.features
            .filter(isDam)
            .map(onRiver)
            .filter((at): at is Projection => at !== undefined)
            .sort((left, right) => right.along - left.along);
          if (all.length === 0) {
            return "no OSM dam or weir on the river";
          }
          return {
            at: all[0],
            status: "needsReview",
            reason: `The weir nearest the river's mouth (${formatMetres(lengthM(stem) - all[0].along)} upstream of it), of ${all.length} weirs on the river in OSM.`,
          };
        }
        return this.locateFeature("dam or weir", isDam, onRiver, recipe);
      }
      case "bridge":
        return this.locateFeature(
          "bridge",
          (feature) =>
            feature.geometry.length > 1 && (feature.tags.bridge !== undefined || feature.tags.man_made === "bridge"),
          (feature) =>
            lineCrossings(stem, feature.geometry)[0] ??
            (feature.tags.man_made === "bridge" ? this.nearest(feature) : undefined),
          recipe,
        );
      case "hydroPlant": {
        const found = this.locateFeature(
          "hydro power plant",
          (feature) =>
            (feature.tags.power === "plant" || feature.tags.power === "generator") &&
            /hydro|water/.test(feature.tags["plant:source"] ?? feature.tags["generator:source"] ?? ""),
          (feature) => this.nearest(feature),
          { near: recipe.near },
        );
        if (typeof found !== "string") {
          return found;
        }
        const place = this.place(recipe.near);
        if (!place) {
          return found;
        }
        return {
          at: place.at,
          status: "needsReview",
          reason: `${found[0].toUpperCase()}${found.slice(1)}; placed at ${recipe.near} instead.`,
        };
      }
      case "place": {
        const found = this.place(recipe.name);
        if (!found) {
          return `no OSM place "${recipe.name}" within ${formatMetres(PLACE_MAX_M)} of the river`;
        }
        return {
          at: found.at,
          status: "needsReview",
          reason: `"${recipe.name}" is a place, not a point: snapped the OSM place node to the river (${formatMetres(found.at.distance)} away).`,
        };
      }
      case "offset": {
        const base = this.locate(recipe.base);
        if (typeof base === "string") {
          return base;
        }
        const along = Math.max(0, Math.min(lengthM(stem), base.at.along + recipe.metres));
        const dir = recipe.metres < 0 ? "upstream" : "downstream";
        return {
          at: { along, point: pointAt(stem, along), distance: base.at.distance },
          status: base.status,
          reason: `${Math.abs(recipe.metres)} m ${dir} of: ${base.reason}`,
        };
      }
      case "sameAs":
        throw new Error("sameAs is resolved by the caller");
    }
  }
}

const roundTo5Decimals = (x: number) => Math.round(x * 1e5) / 1e5;
const roundPt = (point: Pt): Pt => ({ lat: roundTo5Decimals(point.lat), lng: roundTo5Decimals(point.lng) });

export type BuildResult = { stretches: DraftStretch[]; problems: string[] };

export function buildStretches(input: BuildInput): BuildResult {
  const border = input.osm.border.elements.map(geometryOf).filter((points) => points.length > 1);
  const contexts = new Map<string, RiverContext>();
  const riverContext = (river: string) => {
    if (!contexts.has(river)) {
      const config = input.rivers.find((otherRiver) => otherRiver.river === river);
      const result = input.osm.rivers[river];
      if (!config || !result) {
        throw new Error(`no OSM data for the ${river}`);
      }
      contexts.set(river, new RiverContext(config, result, border));
    }
    return contexts.get(river)!;
  };
  const problems: string[] = [];
  const resolved = new Map<string, { at: Projection; status: EndStatus; reason: string; sameAs?: string }>();

  const resolveEnd = (row: AnnexRow, end: "from" | "to", spec: EndSpec, ctx: RiverContext) => {
    const id = `${row.id}.${end}`;
    if (spec.recipe.kind === "sameAs") {
      const target = `${spec.recipe.stretch}.${spec.recipe.end}`;
      const other = resolved.get(target);
      if (!other) {
        throw new Error(`${id}: ${target} must be listed before it`);
      }
      const at = projectOntoLine(ctx.stem, other.at.point);
      resolved.set(id, { ...other, at, sameAs: other.sameAs ?? target });
      return;
    }
    const located = ctx.locate(spec.recipe);
    if (typeof located === "string") {
      problems.push(`${id}: ${located}`);
      const fallback = end === "from" ? 0 : lengthM(ctx.stem);
      resolved.set(id, {
        at: { along: fallback, point: pointAt(ctx.stem, fallback), distance: 0 },
        status: "needsReview",
        reason: `Not found: ${located}. Placed at the ${end === "from" ? "start" : "end"} of the river as a placeholder.`,
      });
      return;
    }
    let status: EndStatus = located.status;
    let reason = located.reason;
    if (spec.inferred) {
      status = "needsReview";
      reason = `${spec.inferred} ${reason}`;
    }
    const decision = input.review?.[id];
    if (decision) {
      const reviewed = { lat: decision.lat, lng: decision.lng };
      if (decision.action === "move") {
        const at = projectOntoLine(ctx.stem, reviewed);
        resolved.set(id, {
          at,
          status: "reviewed",
          reason: `Moved by review${decision.note ? `: ${decision.note}` : "."}`,
        });
        return;
      }
      if (distanceM(located.at.point, reviewed) <= CONFIRM_TOLERANCE_M) {
        resolved.set(id, { at: located.at, status: "reviewed", reason: `Confirmed by review. ${reason}` });
        return;
      }
      status = "needsReview";
      reason = `Confirmed in review, but OSM now puts it ${formatMetres(distanceM(located.at.point, reviewed))} away. ${reason}`;
    }
    resolved.set(id, { at: located.at, status, reason });
  };

  const stretches: DraftStretch[] = [];
  for (const recipe of input.recipes) {
    const row = input.annex.find((annexRow) => annexRow.id === recipe.id);
    if (!row) {
      throw new Error(`no Annex row ${recipe.id}`);
    }
    const ctx = riverContext(row.river);
    if (ctx.stem.length < 2) {
      problems.push(`${row.id}: no OSM course for the ${row.river}`);
      continue;
    }
    resolveEnd(row, "from", recipe.from, ctx);
    resolveEnd(row, "to", recipe.to, ctx);
    const from = resolved.get(`${row.id}.from`)!;
    const to = resolved.get(`${row.id}.to`)!;
    if (to.at.along - from.at.along < 100) {
      problems.push(`${row.id}: the end is not downstream of the start`);
      for (const end of [from, to]) {
        end.status = "needsReview";
        end.reason = `The end is not downstream of the start. ${end.reason}`;
      }
    }
    const lo = Math.min(from.at.along, to.at.along);
    const hi = Math.max(from.at.along, to.at.along, lo + 1);
    const line = simplify(sliceLine(ctx.stem, lo, hi), SIMPLIFY_M).map(roundPt);
    const endOf = (text: { fr: string; en: string }, end: typeof from): StretchEnd => ({
      ...text,
      point: roundPt(end.at.point),
      status: end.status,
      reason: end.reason,
      ...(end.sameAs ? { sameAs: end.sameAs } : {}),
    });
    stretches.push({
      ...row,
      from: endOf(row.from, from),
      to: endOf(row.to, to),
      line: line.map((point) => [point.lng, point.lat]),
      lengthKm: Math.round((hi - lo) / 100) / 10,
    });
  }
  return { stretches, problems };
}

/** The ends a reviewer must look at: needs review and not shared with another (reviewed there). */
export function endsNeedingReview(stretches: readonly DraftStretch[]): string[] {
  return stretches.flatMap((stretch) =>
    (["from", "to"] as const)
      .filter((end) => stretch[end].status === "needsReview" && !stretch[end].sameAs)
      .map((end) => `${stretch.id}.${end}`),
  );
}
