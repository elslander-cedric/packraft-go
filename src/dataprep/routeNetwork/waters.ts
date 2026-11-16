// The waters outside Wallonia (ADR 0039), from OSM: named rivers and canals, cut at every
// confluence, so a paddle link can follow a river into the one it runs into. A river's OSM
// ways point the way it flows; a canal is paddled either way, so it is here both ways.
import type { OverpassElement, OverpassResult } from "../walloonStretches/overpass";
import type { Pt } from "../walloonStretches/geo";

export type Water = {
  readonly id: string;
  /** Its OSM name. */
  readonly river: string;
  /** For a river, the way it flows. */
  readonly line: readonly Pt[];
  readonly canal: boolean;
  /** On a canal's way back, the water it is the way back of. */
  readonly reverseOf?: string;
  /** The water this one runs into, end to start: the same water first. */
  readonly next?: string;
};

/** Part of an OSM way between confluences, or several such parts end to end. */
type Run = { readonly way: number; readonly name: string; readonly canal: boolean; readonly nodes: readonly number[]; readonly line: readonly Pt[] };

const isWater = (element: OverpassElement) =>
  element.type === "way" &&
  ["river", "canal"].includes(element.tags?.waterway ?? "") &&
  (element.tags?.name ?? "") !== "" &&
  element.nodes !== undefined &&
  element.geometry?.length === element.nodes.length &&
  element.geometry.every((point) => point !== null);

/** How many way ends and way middles meet at each node: 2 where a water just carries on. */
function degrees(ways: readonly OverpassElement[]): Map<number, number> {
  const degree = new Map<number, number>();
  for (const way of ways) {
    const nodes = way.nodes!;
    nodes.forEach((node, i) => {
      degree.set(node, (degree.get(node) ?? 0) + (i === 0 || i === nodes.length - 1 ? 1 : 2));
    });
  }
  return degree;
}

/** Each way cut at the confluences in its middle. */
function runsOf(way: OverpassElement, degree: ReadonlyMap<number, number>): Run[] {
  const nodes = way.nodes!;
  const line = way.geometry!.map((point) => ({ lat: point!.lat, lng: point!.lon }));
  const run = (from: number, to: number): Run => ({
    way: way.id,
    name: way.tags!.name,
    canal: way.tags!.waterway === "canal",
    nodes: nodes.slice(from, to + 1),
    line: line.slice(from, to + 1),
  });
  const runs: Run[] = [];
  let from = 0;
  for (let i = 1; i < nodes.length - 1; i++) {
    if ((degree.get(nodes[i]) ?? 0) > 2) {
      runs.push(run(from, i));
      from = i;
    }
  }
  runs.push(run(from, nodes.length - 1));
  return runs;
}

const reversed = (run: Run): Run => ({ ...run, nodes: [...run.nodes].reverse(), line: [...run.line].reverse() });
const startOf = (run: Run) => run.nodes[0];
const endOf = (run: Run) => run.nodes[run.nodes.length - 1];

/** The runs joined end to end where the same water just carries on, a canal whichever way its ways point. */
function joined(runs: readonly Run[], degree: ReadonlyMap<number, number>): Run[] {
  const left = new Set(runs);
  const atNode = new Map<number, Run[]>();
  for (const run of runs) {
    for (const node of [startOf(run), endOf(run)]) atNode.set(node, [...(atNode.get(node) ?? []), run]);
  }
  /** The run of the same water that carries on from `node`, turned to start (or end) there. */
  const take = (node: number, run: Run, wanted: "start" | "end"): Run | undefined => {
    if (degree.get(node) !== 2) return undefined;
    const other = (atNode.get(node) ?? []).find(
      (candidate) => left.has(candidate) && candidate.name === run.name && candidate.canal === run.canal,
    );
    if (!other) return undefined;
    const fits = (wanted === "start" ? startOf(other) : endOf(other)) === node;
    if (!fits && !run.canal) return undefined;
    left.delete(other);
    return fits ? other : reversed(other);
  };
  const join = (first: Run, second: Run): Run => ({
    ...first,
    nodes: [...first.nodes, ...second.nodes.slice(1)],
    line: [...first.line, ...second.line.slice(1)],
  });
  const result: Run[] = [];
  for (const run of runs) {
    if (!left.delete(run)) continue;
    let whole = run;
    for (let next = take(endOf(whole), whole, "start"); next; next = take(endOf(whole), whole, "start")) {
      whole = join(whole, next);
    }
    for (let before = take(startOf(whole), whole, "end"); before; before = take(startOf(whole), whole, "end")) {
      whole = { ...join(before, whole), way: whole.way };
    }
    result.push(whole);
  }
  return result;
}

export function watersFromOsm(osm: OverpassResult): Water[] {
  const unique = new Map(osm.elements.filter(isWater).map((way) => [way.id, way]));
  const ways = [...unique.values()];
  const degree = degrees(ways);
  const runs = joined(
    ways.flatMap((way) => runsOf(way, degree)),
    degree,
  );
  const pieces = runs.flatMap((run) => {
    const id = `water-${run.way}-${startOf(run)}`;
    const forward = { id, run };
    return run.canal ? [forward, { id: `${id}-back`, run: reversed(run), reverseOf: id }] : [forward];
  });
  const startingAt = new Map<number, typeof pieces>();
  for (const piece of pieces) startingAt.set(startOf(piece.run), [...(startingAt.get(startOf(piece.run)) ?? []), piece]);
  return pieces.map(({ id, run, reverseOf }: { id: string; run: Run; reverseOf?: string }) => {
    const next = (startingAt.get(endOf(run)) ?? [])
      .filter((other) => endOf(other.run) !== startOf(run))
      .sort((a, b) => Number(b.run.name === run.name) - Number(a.run.name === run.name) || a.id.localeCompare(b.id))[0];
    return {
      id,
      river: run.name,
      line: run.line,
      canal: run.canal,
      ...(reverseOf ? { reverseOf } : {}),
      ...(next ? { next: next.id } : {}),
    };
  });
}
