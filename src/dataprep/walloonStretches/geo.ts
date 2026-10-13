// Small plane geometry for the stretch preparation (#54). Distances use a local
// equirectangular projection: accurate to well under a metre per km at these latitudes.

export type Pt = { lat: number; lng: number };

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export function distanceM(a: Pt, b: Pt): number {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lng - b.lng) * mPerDegLng((a.lat + b.lat) / 2);
  return Math.hypot(dx, dy);
}

/** Cumulative distance along the line at each vertex. */
export function cumulative(line: readonly Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distanceM(line[i - 1], line[i]));
  return out;
}

export function lengthM(line: readonly Pt[]): number {
  const c = cumulative(line);
  return c[c.length - 1] ?? 0;
}

export type Projection = { along: number; point: Pt; distance: number };

/** The nearest point on the line to p, with its distance along the line. */
export function project(line: readonly Pt[], p: Pt): Projection {
  const cum = cumulative(line);
  let best: Projection = { along: 0, point: line[0], distance: distanceM(line[0], p) };
  const k = mPerDegLng(p.lat);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const ax = (a.lng - p.lng) * k;
    const ay = (a.lat - p.lat) * M_PER_DEG_LAT;
    const bx = (b.lng - p.lng) * k;
    const by = (b.lat - p.lat) * M_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (distance < best.distance) {
      best = {
        distance,
        along: cum[i - 1] + t * (cum[i] - cum[i - 1]),
        point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) },
      };
    }
  }
  return best;
}

/** The point at a distance along the line (clamped to its ends). */
export function pointAt(line: readonly Pt[], along: number): Pt {
  const cum = cumulative(line);
  if (along <= 0) return line[0];
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= along) {
      const span = cum[i] - cum[i - 1];
      const t = span === 0 ? 0 : (along - cum[i - 1]) / span;
      const a = line[i - 1];
      const b = line[i];
      return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    }
  }
  return line[line.length - 1];
}

/** The part of the line between two distances along it (from < to). */
export function slice(line: readonly Pt[], from: number, to: number): Pt[] {
  const cum = cumulative(line);
  const out: Pt[] = [pointAt(line, from)];
  for (let i = 0; i < line.length; i++) if (cum[i] > from && cum[i] < to) out.push(line[i]);
  out.push(pointAt(line, to));
  return out;
}

/** Where two lines cross, as distances along the first one. */
export function crossings(line: readonly Pt[], other: readonly Pt[]): Projection[] {
  const cum = cumulative(line);
  const out: Projection[] = [];
  for (let i = 1; i < line.length; i++) {
    const p1 = line[i - 1];
    const p2 = line[i];
    for (let j = 1; j < other.length; j++) {
      const q1 = other[j - 1];
      const q2 = other[j];
      const d = (p2.lng - p1.lng) * (q2.lat - q1.lat) - (p2.lat - p1.lat) * (q2.lng - q1.lng);
      if (d === 0) continue;
      const t = ((q1.lng - p1.lng) * (q2.lat - q1.lat) - (q1.lat - p1.lat) * (q2.lng - q1.lng)) / d;
      const u = ((q1.lng - p1.lng) * (p2.lat - p1.lat) - (q1.lat - p1.lat) * (p2.lng - p1.lng)) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        out.push({
          along: cum[i - 1] + t * (cum[i] - cum[i - 1]),
          point: { lat: p1.lat + t * (p2.lat - p1.lat), lng: p1.lng + t * (p2.lng - p1.lng) },
          distance: 0,
        });
      }
    }
  }
  return out.sort((a, b) => a.along - b.along);
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplify(line: readonly Pt[], toleranceM: number): Pt[] {
  if (line.length <= 2) return [...line];
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let worstD = toleranceM;
    for (let i = s + 1; i < e; i++) {
      const d = project([line[s], line[e]], line[i]).distance;
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst > 0) {
      keep[worst] = true;
      stack.push([s, worst], [worst, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}
