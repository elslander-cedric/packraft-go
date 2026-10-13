// Assembles a river's main course from its OSM ways (#54). OSM draws waterways
// in the direction of flow, so the longest downstream path through the ways is
// the main course: side channels and mill races drop out. Small gaps in the
// mapping (e.g. where a river runs underground) are bridged.
import { distanceM, type Pt } from "./geo";

/** Ends this close together are joined across a gap in the mapping. */
export const MAX_GAP_M = 1500;

const key = (p: Pt) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`;

export function mainStem(ways: ReadonlyArray<readonly Pt[]>): Pt[] {
  const points = new Map<string, Pt>();
  const out = new Map<string, Map<string, number>>();
  const indeg = new Map<string, number>();
  const addEdge = (a: string, b: string, w: number) => {
    if (a === b) return;
    const edges = out.get(a)!;
    if (edges.has(b)) return;
    edges.set(b, w);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  };
  const touch = (p: Pt) => {
    const k = key(p);
    if (!points.has(k)) {
      points.set(k, p);
      out.set(k, new Map());
      indeg.set(k, 0);
    }
    return k;
  };
  for (const way of ways) {
    for (let i = 1; i < way.length; i++) addEdge(touch(way[i - 1]), touch(way[i]), distanceM(way[i - 1], way[i]));
  }
  if (points.size === 0) return [];

  // Weakly connected components, to bridge gaps only between separate pieces.
  const parent = new Map<string, string>([...points.keys()].map((k) => [k, k]));
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  for (const [a, edges] of out) for (const b of edges.keys()) parent.set(find(a), find(b));
  const sinks = [...points.keys()].filter((k) => out.get(k)!.size === 0);
  const sources = [...points.keys()].filter((k) => indeg.get(k) === 0);
  for (const s of sinks) {
    let best: string | undefined;
    let bestD = MAX_GAP_M;
    for (const t of sources) {
      if (find(t) === find(s)) continue;
      const d = distanceM(points.get(s)!, points.get(t)!);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) {
      addEdge(s, best, bestD);
      parent.set(find(s), find(best));
    }
  }

  // Longest path in the (mostly acyclic) graph: Kahn's order, then dynamic programming.
  const remaining = new Map(indeg);
  const queue = [...points.keys()].filter((k) => remaining.get(k) === 0);
  const order: string[] = [];
  while (queue.length) {
    const k = queue.pop()!;
    order.push(k);
    for (const b of out.get(k)!.keys()) {
      remaining.set(b, remaining.get(b)! - 1);
      if (remaining.get(b) === 0) queue.push(b);
    }
  }
  const dist = new Map<string, number>(order.map((k) => [k, 0]));
  const prev = new Map<string, string>();
  for (const a of order) {
    for (const [b, w] of out.get(a)!) {
      if (!dist.has(b)) continue; // part of a cycle: ignored
      if (dist.get(a)! + w > dist.get(b)!) {
        dist.set(b, dist.get(a)! + w);
        prev.set(b, a);
      }
    }
  }
  let end = order[0];
  for (const k of order) if (dist.get(k)! > dist.get(end)!) end = k;
  const path = [end];
  while (prev.has(path[path.length - 1])) path.push(prev.get(path[path.length - 1])!);
  return path.reverse().map((k) => points.get(k)!);
}
