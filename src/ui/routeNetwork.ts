import type { RouteNetwork } from "@/core/routeNetwork";
import { keepOnSuccess } from "./liveFeed";

/**
 * The built-in route network (ADR 0039), loaded the first time it's asked for, as its own
 * chunk so it stays out of the initial bundle. A failed load isn't kept, so it can be retried.
 */
export const loadRouteNetwork: () => Promise<RouteNetwork> = keepOnSuccess(() =>
  import("@/access/builtInRouteNetwork").then(({ builtInRouteNetwork }) => builtInRouteNetwork),
);
