// Small plane geometry for the stretch preparation. Distances use a local
// equirectangular projection: accurate to well under a metre per km at these latitudes.

export type Pt = { lat: number; lng: number };

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export function distanceM(pointA: Pt, pointB: Pt): number {
  const dy = (pointA.lat - pointB.lat) * M_PER_DEG_LAT;
  const dx = (pointA.lng - pointB.lng) * mPerDegLng((pointA.lat + pointB.lat) / 2);
  return Math.hypot(dx, dy);
}

/** Cumulative distance along the line at each vertex. */
export function cumulativeDistances(line: readonly Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    out.push(out[i - 1] + distanceM(line[i - 1], line[i]));
  }
  return out;
}

export function lengthM(line: readonly Pt[]): number {
  const cumulativeM = cumulativeDistances(line);
  return cumulativeM[cumulativeM.length - 1] ?? 0;
}

export type Projection = { along: number; point: Pt; distance: number };

/** The nearest point on the line to p, with its distance along the line. */
export function projectOntoLine(line: readonly Pt[], point: Pt): Projection {
  const cum = cumulativeDistances(line);
  let best: Projection = { along: 0, point: line[0], distance: distanceM(line[0], point) };
  const metresPerDegreeLng = mPerDegLng(point.lat);
  for (let i = 1; i < line.length; i++) {
    const pointA = line[i - 1];
    const pointB = line[i];
    const ax = (pointA.lng - point.lng) * metresPerDegreeLng;
    const ay = (pointA.lat - point.lat) * M_PER_DEG_LAT;
    const bx = (pointB.lng - point.lng) * metresPerDegreeLng;
    const by = (pointB.lat - point.lat) * M_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const fraction = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const distance = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    if (distance < best.distance) {
      best = {
        distance,
        along: cum[i - 1] + fraction * (cum[i] - cum[i - 1]),
        point: {
          lat: pointA.lat + fraction * (pointB.lat - pointA.lat),
          lng: pointA.lng + fraction * (pointB.lng - pointA.lng),
        },
      };
    }
  }
  return best;
}

/** The point at a distance along the line (clamped to its ends). */
export function pointAt(line: readonly Pt[], along: number): Pt {
  const cum = cumulativeDistances(line);
  if (along <= 0) {
    return line[0];
  }
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= along) {
      const span = cum[i] - cum[i - 1];
      const fraction = span === 0 ? 0 : (along - cum[i - 1]) / span;
      const pointA = line[i - 1];
      const pointB = line[i];
      return {
        lat: pointA.lat + fraction * (pointB.lat - pointA.lat),
        lng: pointA.lng + fraction * (pointB.lng - pointA.lng),
      };
    }
  }
  return line[line.length - 1];
}

/** The part of the line between two distances along it (from < to). */
export function sliceLine(line: readonly Pt[], from: number, to: number): Pt[] {
  const cum = cumulativeDistances(line);
  const out: Pt[] = [pointAt(line, from)];
  for (let i = 0; i < line.length; i++) {
    if (cum[i] > from && cum[i] < to) {
      out.push(line[i]);
    }
  }
  out.push(pointAt(line, to));
  return out;
}

/** Where two lines cross, as distances along the first one. */
export function lineCrossings(line: readonly Pt[], other: readonly Pt[]): Projection[] {
  const cum = cumulativeDistances(line);
  const out: Projection[] = [];
  for (let i = 1; i < line.length; i++) {
    const p1 = line[i - 1];
    const p2 = line[i];
    for (let otherIndex = 1; otherIndex < other.length; otherIndex++) {
      const q1 = other[otherIndex - 1];
      const q2 = other[otherIndex];
      const determinant = (p2.lng - p1.lng) * (q2.lat - q1.lat) - (p2.lat - p1.lat) * (q2.lng - q1.lng);
      if (determinant === 0) {
        continue;
      }
      const fraction = ((q1.lng - p1.lng) * (q2.lat - q1.lat) - (q1.lat - p1.lat) * (q2.lng - q1.lng)) / determinant;
      const otherFraction =
        ((q1.lng - p1.lng) * (p2.lat - p1.lat) - (q1.lat - p1.lat) * (p2.lng - p1.lng)) / determinant;
      if (fraction >= 0 && fraction <= 1 && otherFraction >= 0 && otherFraction <= 1) {
        out.push({
          along: cum[i - 1] + fraction * (cum[i] - cum[i - 1]),
          point: { lat: p1.lat + fraction * (p2.lat - p1.lat), lng: p1.lng + fraction * (p2.lng - p1.lng) },
          distance: 0,
        });
      }
    }
  }
  return out.sort((left, right) => left.along - right.along);
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplify(line: readonly Pt[], toleranceM: number): Pt[] {
  if (line.length <= 2) {
    return [...line];
  }
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let worst = -1;
    let worstD = toleranceM;
    for (let i = start + 1; i < end; i++) {
      const distance = projectOntoLine([line[start], line[end]], line[i]).distance;
      if (distance > worstD) {
        worst = i;
        worstD = distance;
      }
    }
    if (worst > 0) {
      keep[worst] = true;
      stack.push([start, worst], [worst, end]);
    }
  }
  return line.filter((_, i) => keep[i]);
}
