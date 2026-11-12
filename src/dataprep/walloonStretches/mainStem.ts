// Assembles a river's main course from its OSM ways. OSM draws waterways
// in the direction of flow, so the longest downstream path through the ways is
// the main course: side channels and mill races drop out. Small gaps in the
// mapping (e.g. where a river runs underground) are bridged.
import { distanceM, type Pt } from "./geo";

/** Ends this close together are joined across a gap in the mapping. */
export const MAX_GAP_M = 1500;

const key = (point: Pt) => `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;

export function mainStem(ways: ReadonlyArray<readonly Pt[]>): Pt[] {
  const points = new Map<string, Pt>();
  const out = new Map<string, Map<string, number>>();
  const indeg = new Map<string, number>();
  const addEdge = (from: string, to: string, weight: number) => {
    if (from === to) {
      return;
    }
    const edges = out.get(from)!;
    if (edges.has(to)) {
      return;
    }
    edges.set(to, weight);
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
  };
  const touch = (point: Pt) => {
    const aKey = key(point);
    if (!points.has(aKey)) {
      points.set(aKey, point);
      out.set(aKey, new Map());
      indeg.set(aKey, 0);
    }
    return aKey;
  };
  for (const way of ways) {
    for (let i = 1; i < way.length; i++) {
      addEdge(touch(way[i - 1]), touch(way[i]), distanceM(way[i - 1], way[i]));
    }
  }
  if (points.size === 0) {
    return [];
  }

  // Weakly connected components, to bridge gaps only between separate pieces.
  const parent = new Map<string, string>([...points.keys()].map((key) => [key, key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    parent.set(key, root);
    return root;
  };
  for (const [from, edges] of out) {
    for (const key of edges.keys()) {
      parent.set(find(from), find(key));
    }
  }
  const sinks = [...points.keys()].filter((key) => out.get(key)!.size === 0);
  const sources = [...points.keys()].filter((key) => indeg.get(key) === 0);
  for (const sink of sinks) {
    let best: string | undefined;
    let bestD = MAX_GAP_M;
    for (const source of sources) {
      if (find(source) === find(sink)) {
        continue;
      }
      const distance = distanceM(points.get(sink)!, points.get(source)!);
      if (distance < bestD) {
        best = source;
        bestD = distance;
      }
    }
    if (best) {
      addEdge(sink, best, bestD);
      parent.set(find(sink), find(best));
    }
  }

  // Longest path in the (mostly acyclic) graph: Kahn's order, then dynamic programming.
  const remaining = new Map(indeg);
  const queue = [...points.keys()].filter((key) => remaining.get(key) === 0);
  const order: string[] = [];
  while (queue.length) {
    const key = queue.pop()!;
    order.push(key);
    for (const otherKey of out.get(key)!.keys()) {
      remaining.set(otherKey, remaining.get(otherKey)! - 1);
      if (remaining.get(otherKey) === 0) {
        queue.push(otherKey);
      }
    }
  }
  const dist = new Map<string, number>(order.map((key) => [key, 0]));
  const prev = new Map<string, string>();
  for (const from of order) {
    for (const [to, weight] of out.get(from)!) {
      if (!dist.has(to)) {
        continue;
      } // part of a cycle: ignored
      if (dist.get(from)! + weight > dist.get(to)!) {
        dist.set(to, dist.get(from)! + weight);
        prev.set(to, from);
      }
    }
  }
  let end = order[0];
  for (const key of order) {
    if (dist.get(key)! > dist.get(end)!) {
      end = key;
    }
  }
  const path = [end];
  while (prev.has(path[path.length - 1])) {
    path.push(prev.get(path[path.length - 1])!);
  }
  return path.reverse().map((key) => points.get(key)!);
}
