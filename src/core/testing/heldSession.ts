// Test helper: holds a planner session the way the planner page does, so the
// auto router's dispatched actions run through the session function.
import { firstSession, plannerSession, type PlannerAction, type PlannerSession } from "../plannerSession";
import type { Trip } from "../trip";

export type HeldSession = {
  readonly session: PlannerSession;
  readonly trip: Trip;
  dispatch(action: PlannerAction): void;
};

export function heldSession(trip: Trip): HeldSession {
  let session = firstSession({ trip });
  return {
    get session() {
      return session;
    },
    get trip() {
      return session.trip;
    },
    dispatch(action) {
      session = plannerSession(session, action);
    },
  };
}
