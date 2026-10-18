// Test helper: feeds the auto router's routing actions through the core's pure
// functions onto a trip held by the test (the way the planner applies them).
import { applyRoutingAction, type RoutingDispatch } from "../routing";
import type { Trip } from "../trip";

export const routingInto =
  (update: (change: (trip: Trip) => Trip) => void): RoutingDispatch =>
  (action) =>
    update((trip) => applyRoutingAction(trip, action));
