// Your access points by the trip's route (#156, GLOSSARY "On the route"): the
// ones on the route in route order, then the rest nearest to you. Pure: your
// position is passed in by the caller.
import type { AccessPoint, AccessPoints } from "./accessPoints";
import { distanceM, projectOntoLine } from "./geo";
import { SNAP_DISTANCE_M } from "./snap";
import { putInsAndTakeOuts, type LatLng, type Trip } from "./trip";

/** How close to the route an access point must be to be on it, in metres: the snap distance. */
export const ON_ROUTE_M = SNAP_DISTANCE_M;

/** How close a put-in or take-out must be to an access point to be at it, in metres. */
const AT_M = 10;

export type OnRoute = {
  readonly point: AccessPoint;
  /** How far along the route from the trip's start, in km. */
  readonly alongKm: number;
  /** The trip's put-in or take-out is at this access point. */
  readonly role: "put-in" | "take-out" | null;
};

export type NotOnRoute = {
  readonly point: AccessPoint;
  /** How far it is from your position, in km; null without a position. */
  readonly fromYouKm: number | null;
};

export type AccessPointsByRoute = {
  /** The trip has a route (at least one leg); without one, every point is in `notOnRoute`. */
  readonly hasRoute: boolean;
  /** In route order. */
  readonly onRoute: readonly OnRoute[];
  /**
   * Nearest to your position first; without a position, nearest to the route
   * first; with neither, in the order they were added.
   */
  readonly notOnRoute: readonly NotOnRoute[];
};

/**
 * The trip's route as one line: each leg's routed geometry, or the straight
 * line between its points while it isn't routed (pending or failed).
 */
function routeLine(trip: Trip): LatLng[] {
  return trip.legs.flatMap((leg, i): readonly LatLng[] => {
    const line: readonly LatLng[] = leg.route?.status === "routed" ? leg.route.geometry : [trip.points[i], trip.points[i + 1]];
    // Each leg starts where the one before it ended: drop the repeated point.
    return i === 0 ? line : line.slice(1);
  });
}

/** Your access points split by the trip's route, given your position (null when not shown). */
export function accessPointsByRoute(trip: Trip, points: AccessPoints, you: LatLng | null): AccessPointsByRoute {
  const line = routeLine(trip);
  const hasRoute = line.length >= 2;
  const fromYouKm = (point: AccessPoint) => (you ? distanceM(you, point.position) / 1000 : null);
  if (!hasRoute) {
    const notOnRoute = points.map((point) => ({ point, fromYouKm: fromYouKm(point) }));
    if (you) notOnRoute.sort((a, b) => a.fromYouKm! - b.fromYouKm!);
    return { hasRoute, onRoute: [], notOnRoute };
  }
  const changes = putInsAndTakeOuts(trip);
  const onRoute: OnRoute[] = [];
  const rest: (NotOnRoute & { offM: number })[] = [];
  for (const point of points) {
    const { offM, alongM } = projectOntoLine(point.position, line);
    if (offM <= ON_ROUTE_M) {
      const change = changes.find((c) => distanceM(trip.points[c.point], point.position) <= AT_M);
      onRoute.push({ point, alongKm: alongM / 1000, role: change?.kind ?? null });
    } else rest.push({ point, fromYouKm: fromYouKm(point), offM });
  }
  onRoute.sort((a, b) => a.alongKm - b.alongKm);
  rest.sort((a, b) => (you ? a.fromYouKm! - b.fromYouKm! : a.offM - b.offM));
  return { hasRoute, onRoute, notOnRoute: rest.map(({ point, fromYouKm }) => ({ point, fromYouKm })) };
}
