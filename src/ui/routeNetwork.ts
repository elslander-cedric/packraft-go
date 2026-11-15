"use client";

import type { RouteNetwork } from "@/core/routeNetwork";
import { createLiveFeed, keepOnSuccess, useLiveFeed } from "./liveFeed";

/**
 * The built-in route network (ADR 0039), loaded the first time it's asked for, as its own
 * chunk so it stays out of the initial bundle. A failed load isn't kept, so it can be retried.
 */
export const loadRouteNetwork: () => Promise<RouteNetwork> = keepOnSuccess(() =>
  import("@/access/builtInRouteNetwork").then(({ builtInRouteNetwork }) => builtInRouteNetwork),
);

/** How long after a failed chunk load to try again: soon, as it only takes signal. */
const RETRY_MS = 60 * 1000;

const networkFeed = createLiveFeed<RouteNetwork | null>(() => loadRouteNetwork().catch(() => null), {
  everyMs: RETRY_MS,
  settled: (network) => network !== null,
});

/**
 * The built-in route network while it is wanted: undefined while its chunk loads, null while it
 * can't be loaded (it is asked for again a minute later).
 */
export function useRouteNetwork(wanted: boolean): RouteNetwork | null | undefined {
  return useLiveFeed(networkFeed, wanted);
}
