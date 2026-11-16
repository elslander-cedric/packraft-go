"use client";

import { useMemo } from "react";
import { withAccessPoints } from "@/core/accessPointNetwork";
import type { AccessPoints } from "@/core/accessPoints";
import type { Bounds } from "@/core/geo";
import type { Pace, TripWishes } from "@/core/settings";
import { suggestTrips, type SuggestedTrips } from "@/core/suggestedTrips";
import { useRouteNetwork } from "../routeNetwork";
import { localToday, useAccessRules, useBuiltInObstacles } from "../useAccessRules";
import { useOfficialStatus } from "../useOfficialStatus";
import { useWalloonFlows } from "../useWalloonFlows";

/** One search: the wishes, the date (YYYY-MM-DD) and the visible map area when Find trips was confirmed. */
export type TripSearch = {
  readonly wishes: TripWishes;
  readonly date: string;
  readonly area: Bounds;
};

/**
 * What the browse view shows: the search's answer, or why there isn't one yet.
 * - `loading`: the route network or the access rules are still loading.
 * - `waiting`: a search for today waits for today's official status and flows, which would
 *   otherwise count as not open and leave out water that is open.
 * - `failed`: the route network can't be loaded (it is asked for again).
 */
export type SuggestedTripsState =
  { readonly status: "loading" } | { readonly status: "waiting" } | { readonly status: "failed" } | SuggestedTrips;

/**
 * The suggested trips for `search` (none while it is null), through the route network and your
 * access points, which join it with estimated walks. The search itself is pure and
 * instant (ADR 0039); this loads what it runs on and, for today, today's live readings, which
 * the rest of the page shares.
 */
export function useSuggestedTrips(search: TripSearch | null, pace: Pace, accessPoints: AccessPoints): SuggestedTripsState {
  const wanted = search !== null;
  const network = useRouteNetwork(wanted);
  const rules = useAccessRules(wanted);
  // From the rules' chunk: where obstacles are, for the links your access points split. Until
  // then (or if it fails) both parts of a split link keep all its obstacles, which is safe.
  const obstacles = useBuiltInObstacles(wanted);
  const today = localToday();
  const forToday = wanted && search.date === today;
  const flows = useWalloonFlows(rules, forToday);
  const official = useOfficialStatus(rules, forToday);

  return useMemo<SuggestedTripsState>(() => {
    if (network === null) return { status: "failed" };
    if (!search || !network || !rules) return { status: "loading" };
    if (forToday && (!flows || !official)) return { status: "waiting" };
    const when = {
      date: search.date,
      today,
      ...(flows && { flows }),
      ...(official && { official }),
    };
    return suggestTrips({
      network: withAccessPoints(network, accessPoints, obstacles ?? []),
      rules,
      when,
      area: search.area,
      wishes: search.wishes,
      pace,
    });
  }, [network, rules, obstacles, search, forToday, flows, official, today, pace, accessPoints]);
}
