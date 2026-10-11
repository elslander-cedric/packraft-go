// Test double for the Router interface. Never imported by app code.
import type { RouteResult, Router } from "../router";
import type { LatLng, LegMode } from "../trip";

export type FakeRouter = Router & {
  /** Every leg the router was asked to route, in order. */
  readonly calls: readonly { mode: LegMode; points: readonly LatLng[] }[];
};

/**
 * A router that answers each mode with a fixed result (e.g. a recorded BRouter
 * response converted to a RouteResult). Modes without a result get a
 * `no-route` failure.
 */
export function createFakeRouter(results: Partial<Record<LegMode, RouteResult>>): FakeRouter {
  const calls: { mode: LegMode; points: readonly LatLng[] }[] = [];
  return {
    calls,
    async route(mode, points) {
      calls.push({ mode, points });
      return results[mode] ?? { ok: false, failure: { kind: "no-route" } };
    },
  };
}
