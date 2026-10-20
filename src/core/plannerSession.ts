// The planner session (GLOSSARY, ADR 0025): what the planner is working on right
// now, as one pure function `(session, action) -> session`. It is the only
// writer of the trip. The planner page runs it with a reducer and keeps the side
// effects (autosave, route requests, reading and downloading files, key bindings).
//
// One rule per piece of state (see ADR 0025):
// - selected point: cleared by add, move and delete point, set leg mode, undo,
//   accept offer and any replace of the trip; kept by everything else.
// - snap offers: set leg mode replaces them with the offers worked out from the
//   trip it produced; add, move, delete, undo and replace drop them; accept and
//   decline remove that one offer; access points changed drops the offers to a
//   deleted access point and makes the offers to a moved one follow it.
// - file error: set by file rejected; cleared by every other action except a
//   route being requested or arriving.
// - stored save kept (#28): cleared when the trip is replaced.
// - replace question: new trip and file opened ask it when the current trip needs
//   confirmation. While it is open only confirm, cancel and the routing actions
//   apply.
// Actions that can't apply return the same session.
import type { AccessPoints } from "./accessPoints";
import type { CalendarDate } from "./calendarDate";
import { applyRoutingAction, retryLeg, type RoutingAction } from "./routing";
import { distanceM } from "./geo";
import { snapOffers, snapToAccessPoint, type SnapOffer } from "./snap";
import {
  applyEdit,
  emptyTrip,
  newTripNeedsConfirmation,
  renameTrip,
  setStartDate,
  type LatLng,
  type LegMode,
  type Trip,
} from "./trip";

/** The questions asked before a trip with points is replaced. */
export type ReplaceQuestion = "newTrip" | "openFile";

/** Why a file could not be opened. */
export type FileError = "unknown-version" | "invalid";

export type PlannerSession = {
  readonly trip: Trip;
  /** Index of the selected point, or null. */
  readonly selectedPoint: number | null;
  readonly offers: readonly SnapOffer[];
  readonly fileError: FileError | null;
  /** A stored save of an unknown version is kept, not overwritten, until the trip is replaced (#28). */
  readonly keepStoredSave: boolean;
  /** The last question asked; kept after it is answered. */
  readonly question: ReplaceQuestion;
  /** The trip waiting to replace the current one until the question is answered. */
  readonly pendingTrip: Trip | null;
};

export type PlannerAction =
  | { readonly type: "addPoint"; readonly at: LatLng }
  | { readonly type: "movePoint"; readonly index: number; readonly to: LatLng }
  | { readonly type: "deleteSelectedPoint" }
  | { readonly type: "setLegMode"; readonly index: number; readonly mode: LegMode; readonly accessPoints: AccessPoints }
  | { readonly type: "accessPointsChanged"; readonly accessPoints: AccessPoints }
  | { readonly type: "toggleCampOnSelectedPoint" }
  | { readonly type: "undo" }
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "setStartDate"; readonly date: CalendarDate | undefined }
  | { readonly type: "retryLeg"; readonly index: number }
  | { readonly type: "pointClicked"; readonly index: number }
  | { readonly type: "deselect" }
  | { readonly type: "acceptOffer"; readonly offer: SnapOffer }
  | { readonly type: "declineOffer"; readonly offer: SnapOffer }
  | { readonly type: "newTrip" }
  | { readonly type: "fileOpened"; readonly trip: Trip }
  | { readonly type: "fileRejected"; readonly reason: FileError }
  | { readonly type: "confirmReplace" }
  | { readonly type: "cancelReplace" }
  | { readonly type: "fileDownloaded" }
  | RoutingAction;

/** The first session, from what loading the stored trip returned. */
export function firstSession(stored: { readonly trip: Trip; readonly unknownVersion?: boolean }): PlannerSession {
  return {
    trip: stored.trip,
    selectedPoint: null,
    offers: [],
    fileError: null,
    keepStoredSave: stored.unknownVersion ?? false,
    question: "newTrip",
    pendingTrip: null,
  };
}

const replaced = (session: PlannerSession, trip: Trip): PlannerSession => ({
  ...session,
  trip,
  selectedPoint: null,
  offers: [],
  fileError: null,
  keepStoredSave: false,
  pendingTrip: null,
});

/** Replaces the trip, asking first when that would lose points (it cannot be undone). */
const replace = (session: PlannerSession, next: Trip, question: ReplaceQuestion): PlannerSession =>
  newTripNeedsConfirmation(session.trip)
    ? { ...session, question, pendingTrip: next, fileError: null }
    : replaced(session, next);

/** An edit of the points or leg modes: selection and offers are dropped. */
const edited = (session: PlannerSession, trip: Trip, offers: readonly SnapOffer[] = []): PlannerSession => ({
  ...session,
  trip,
  selectedPoint: null,
  offers,
  fileError: null,
});

/** Offers after your access points changed: deleted ones drop, moved ones follow. */
const followAccessPoints = (trip: Trip, offers: readonly SnapOffer[], accessPoints: AccessPoints): SnapOffer[] =>
  offers.flatMap((offer) => {
    const accessPoint = accessPoints.find((a) => a.id === offer.accessPoint.id);
    const at = trip.points[offer.change.point];
    if (!accessPoint || !at) return [];
    if (accessPoint === offer.accessPoint) return [offer];
    return [{ ...offer, accessPoint, distanceM: distanceM(at, accessPoint.position) }];
  });

const routing = (session: PlannerSession, action: RoutingAction): PlannerSession => {
  const trip = applyRoutingAction(session.trip, action);
  return trip === session.trip ? session : { ...session, trip };
};

export function plannerSession(session: PlannerSession, action: PlannerAction): PlannerSession {
  if (action.type === "routeRequested" || action.type === "routeArrived") return routing(session, action);
  if (action.type === "confirmReplace") return session.pendingTrip ? replaced(session, session.pendingTrip) : session;
  if (action.type === "cancelReplace") return session.pendingTrip ? { ...session, pendingTrip: null } : session;
  if (session.pendingTrip) return session;

  const { trip } = session;
  switch (action.type) {
    case "addPoint":
      return edited(session, applyEdit(trip, action));
    case "movePoint":
      return edited(session, applyEdit(trip, action));
    case "deleteSelectedPoint":
      return session.selectedPoint === null
        ? session
        : edited(session, applyEdit(trip, { type: "deletePoint", index: session.selectedPoint }));
    case "setLegMode": {
      const after = applyEdit(trip, { type: "setLegMode", index: action.index, mode: action.mode });
      return edited(session, after, snapOffers(trip, after, action.accessPoints));
    }
    case "accessPointsChanged":
      return { ...session, offers: followAccessPoints(trip, session.offers, action.accessPoints), fileError: null };
    case "toggleCampOnSelectedPoint":
      return session.selectedPoint === null
        ? session
        : { ...session, trip: applyEdit(trip, { type: "toggleCamp", index: session.selectedPoint }), fileError: null };
    case "undo":
      return edited(session, applyEdit(trip, { type: "undo" }));
    case "rename":
      return { ...session, trip: renameTrip(trip, action.name), fileError: null };
    case "setStartDate":
      return { ...session, trip: setStartDate(trip, action.date), fileError: null };
    case "retryLeg":
      return { ...session, trip: retryLeg(trip, action.index), fileError: null };
    case "pointClicked":
      return {
        ...session,
        selectedPoint: session.selectedPoint === action.index ? null : action.index,
        fileError: null,
      };
    case "deselect":
      return { ...session, selectedPoint: null, fileError: null };
    case "acceptOffer":
      return session.offers.includes(action.offer)
        ? {
            ...session,
            trip: snapToAccessPoint(trip, action.offer),
            selectedPoint: null,
            offers: session.offers.filter((o) => o !== action.offer),
            fileError: null,
          }
        : session;
    case "declineOffer":
      return session.offers.includes(action.offer)
        ? { ...session, offers: session.offers.filter((o) => o !== action.offer), fileError: null }
        : session;
    case "newTrip":
      return replace(session, emptyTrip(), "newTrip");
    case "fileOpened":
      return replace(session, action.trip, "openFile");
    case "fileRejected":
      return { ...session, fileError: action.reason };
    case "fileDownloaded":
      return session.fileError === null ? session : { ...session, fileError: null };
  }
}
