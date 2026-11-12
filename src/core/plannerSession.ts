// The planner session (GLOSSARY, ADR 0025): what the planner is working on right
// now, as one pure function `(session, action) -> session`. It is the only
// writer of the trip. The planner page runs it with a reducer and keeps the side
// effects (autosave, route requests, reading and downloading files, key bindings).
//
// One rule per piece of state (see ADR 0025):
// - selected point: cleared by add, move and delete point, back to start, set leg mode, undo,
//   accept offer and any replace of the trip; insert point makes it follow the
//   selected point when the insert shifts its index; leg clicked clears it; kept by everything else.
// - selected leg: set by leg clicked (cleared by a click on it again), cleared by point
//   clicked, deselect, entering access point editing and every edit of the points, undo, accept
//   offer and any replace; kept by set leg mode, so its mode can be switched back, and by
//   everything else. A selected point and a selected leg never go together.
// - snap offers: set leg mode, add point and move point replace them with the offers worked
//   out from the trip they produced (a move offers only for the moved point); insert, delete,
//   back to start, undo and replace drop them; accept and
//   decline remove that one offer; access points changed drops the offers to a
//   deleted access point, makes the offers to a moved one follow it and leaves
//   the offers to official aires alone.
// - file error: set by file rejected; cleared by every other action except a
//   route being requested or arriving.
// - stored save kept: cleared when the trip is replaced.
// - replace question: new trip and file opened ask it when the current trip needs
//   confirmation. While it is open only confirm, cancel and the routing actions
//   apply.
// - mode (ADR 0036): normal on load (never stored); enter access point editing sets it,
//   keeping the panel view to return to, and Done sets it back. Both clear the selection.
//   While editing access points the trip is frozen: the actions that edit its points or
//   leg modes, select a point or a leg or answer a snap offer return the same session; the offers wait
//   for Done (still following your access points).
// Actions that can't apply return the same session.
import type { AccessPoints } from "./accessPoints";
import type { CalendarDate } from "./calendarDate";
import type { OfficialAire } from "./officialAire";
import { applyRoutingAction, retryLeg, type RoutingAction } from "./routing";
import { distanceM } from "./geo";
import { acceptSnap, movedPointOffers, snapOffers, type SnapOffer } from "./snap";
import {
  applyEdit,
  canGoBackToStart,
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

/** Where the bottom sheet rests: just the header, half the screen, or nearly all of it. */
export const sheetStops = ["peek", "half", "full"] as const;
export type SheetStop = (typeof sheetStops)[number];

/** The panel's tabs in normal mode; access point editing shows only the Access points tab (ADR 0036). */
export const normalTabs = ["sections", "days"] as const;
export type NormalTab = (typeof normalTabs)[number];

/**
 * The panel or sheet as it was before access point editing: Done restores it (ADR 0036). The side
 * panel's open state isn't here: it is a stored setting, left alone while editing.
 */
export type PanelView = {
  readonly tab: NormalTab;
  /** The bottom sheet's stop. */
  readonly sheet: SheetStop;
};

/** The planner's mode (GLOSSARY "Access point editing", ADR 0036): always normal on load. */
export type PlannerMode =
  { readonly kind: "normal" } | { readonly kind: "accessPointEditing"; readonly returnTo: PanelView };

/** Whether the planner is editing access points, so the trip is frozen. */
export const editingAccessPoints = (session: PlannerSession): boolean => session.mode.kind === "accessPointEditing";

export type PlannerSession = {
  readonly mode: PlannerMode;
  readonly trip: Trip;
  /** Index of the selected point, or null. */
  readonly selectedPoint: number | null;
  /** Index of the selected leg, or null; never set together with a selected point. */
  readonly selectedLeg: number | null;
  readonly offers: readonly SnapOffer[];
  readonly fileError: FileError | null;
  /** A stored save of an unknown version is kept, not overwritten, until the trip is replaced. */
  readonly keepStoredSave: boolean;
  /** The last question asked; kept after it is answered. */
  readonly question: ReplaceQuestion;
  /** The trip waiting to replace the current one until the question is answered. */
  readonly pendingTrip: Trip | null;
};

/** What the new put-ins and take-outs of an edit may be offered: your access points and the official aires. */
type SnapTargets = { readonly accessPoints: AccessPoints; readonly officialAires: readonly OfficialAire[] };

export type PlannerAction =
  | ({ readonly type: "addPoint"; readonly at: LatLng; readonly mode?: LegMode } & SnapTargets)
  | ({ readonly type: "movePoint"; readonly index: number; readonly to: LatLng } & SnapTargets)
  /** Adds a leg from the last point back to the start (GLOSSARY "Loop"), in `mode` when given. */
  | { readonly type: "backToStart"; readonly mode?: LegMode }
  | { readonly type: "deleteSelectedPoint" }
  /** Inserts a point on leg `leg` of the route, nearest to `near`. */
  | { readonly type: "insertPoint"; readonly index: number; readonly near: LatLng }
  | ({ readonly type: "setLegMode"; readonly index: number; readonly mode: LegMode } & SnapTargets)
  | { readonly type: "accessPointsChanged"; readonly accessPoints: AccessPoints }
  | { readonly type: "toggleCampOnSelectedPoint" }
  | { readonly type: "undo" }
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "setStartDate"; readonly date: CalendarDate | undefined }
  | { readonly type: "retryLeg"; readonly index: number }
  | { readonly type: "pointClicked"; readonly index: number }
  /** A tap on a leg on the map. */
  | { readonly type: "legClicked"; readonly index: number }
  | { readonly type: "deselect" }
  | { readonly type: "acceptOffer"; readonly offer: SnapOffer }
  | { readonly type: "declineOffer"; readonly offer: SnapOffer }
  /** A new trip, starting on `startDate` when given (the planner passes today). */
  | { readonly type: "newTrip"; readonly startDate?: CalendarDate }
  | { readonly type: "fileOpened"; readonly trip: Trip }
  | { readonly type: "fileRejected"; readonly reason: FileError }
  | { readonly type: "confirmReplace" }
  | { readonly type: "cancelReplace" }
  | { readonly type: "fileDownloaded" }
  /** Enters access point editing; Done returns to `returnTo`. */
  | { readonly type: "enterAccessPointEditing"; readonly returnTo: PanelView }
  /** Done: back to normal mode. */
  | { readonly type: "leaveAccessPointEditing" }
  | RoutingAction;

/** The first session, from what loading the stored trip returned. */
export function firstSession(stored: { readonly trip: Trip; readonly unknownVersion?: boolean }): PlannerSession {
  return {
    mode: { kind: "normal" },
    trip: stored.trip,
    selectedPoint: null,
    selectedLeg: null,
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
  selectedLeg: null,
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
  selectedLeg: null,
  offers,
  fileError: null,
});

/** Offers after your access points changed: deleted ones drop, moved ones follow; official aires never change. */
const followAccessPoints = (trip: Trip, offers: readonly SnapOffer[], accessPoints: AccessPoints): SnapOffer[] =>
  offers.flatMap((offer) => {
    if (offer.target.kind !== "access-point") {
      return [offer];
    }
    const { id } = offer.target.accessPoint;
    const accessPoint = accessPoints.find((a) => a.id === id);
    const at = trip.points[offer.change.point];
    if (!accessPoint || !at) {
      return [];
    }
    if (accessPoint === offer.target.accessPoint) {
      return [offer];
    }
    return [
      { ...offer, target: { kind: "access-point", accessPoint }, distanceM: distanceM(at, accessPoint.position) },
    ];
  });

const routing = (session: PlannerSession, action: RoutingAction): PlannerSession => {
  const trip = applyRoutingAction(session.trip, action);
  return trip === session.trip ? session : { ...session, trip };
};

/** What can't apply while editing access points: the trip is frozen. */
const frozenWhileEditing: ReadonlySet<PlannerAction["type"]> = new Set([
  "addPoint",
  "movePoint",
  "backToStart",
  "deleteSelectedPoint",
  "insertPoint",
  "setLegMode",
  "toggleCampOnSelectedPoint",
  "undo",
  "pointClicked",
  "legClicked",
  "acceptOffer",
  "declineOffer",
]);

export function plannerSession(session: PlannerSession, action: PlannerAction): PlannerSession {
  if (action.type === "routeRequested" || action.type === "routeArrived") {
    return routing(session, action);
  }
  if (action.type === "confirmReplace") {
    return session.pendingTrip ? replaced(session, session.pendingTrip) : session;
  }
  if (action.type === "cancelReplace") {
    return session.pendingTrip ? { ...session, pendingTrip: null } : session;
  }
  if (session.pendingTrip) {
    return session;
  }
  if (editingAccessPoints(session) && frozenWhileEditing.has(action.type)) {
    return session;
  }

  const { trip } = session;
  switch (action.type) {
    case "addPoint": {
      const after = applyEdit(trip, { type: "addPoint", at: action.at, mode: action.mode });
      return edited(session, after, snapOffers(trip, after, action.accessPoints, action.officialAires));
    }
    case "movePoint": {
      const after = applyEdit(trip, { type: "movePoint", index: action.index, to: action.to });
      return edited(session, after, movedPointOffers(after, action.index, action.accessPoints, action.officialAires));
    }
    case "backToStart":
      if (!canGoBackToStart(trip)) {
        return session;
      }
      return edited(session, applyEdit(trip, { type: "addPoint", at: trip.points[0], mode: action.mode }));
    case "insertPoint": {
      const after = applyEdit(trip, action);
      if (after === trip) {
        return session;
      }
      const selected = session.selectedPoint;
      // The selection follows its point: a point after the insert moves up by one.
      const follows = selected !== null && selected > action.index ? selected + 1 : selected;
      return { ...edited(session, after), selectedPoint: follows };
    }
    case "deleteSelectedPoint":
      return session.selectedPoint === null
        ? session
        : edited(session, applyEdit(trip, { type: "deletePoint", index: session.selectedPoint }));
    case "setLegMode": {
      const after = applyEdit(trip, { type: "setLegMode", index: action.index, mode: action.mode });
      const offers = snapOffers(trip, after, action.accessPoints, action.officialAires);
      // The legs keep their indices: the selected leg stays selected.
      return { ...edited(session, after, offers), selectedLeg: session.selectedLeg };
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
        selectedLeg: null,
        fileError: null,
      };
    case "legClicked":
      if (!trip.legs[action.index]) {
        return session;
      }
      return {
        ...session,
        selectedLeg: session.selectedLeg === action.index ? null : action.index,
        selectedPoint: null,
        fileError: null,
      };
    case "deselect":
      return { ...session, selectedPoint: null, selectedLeg: null, fileError: null };
    case "acceptOffer":
      return session.offers.includes(action.offer)
        ? {
            ...session,
            trip: acceptSnap(trip, action.offer),
            selectedPoint: null,
            selectedLeg: null,
            offers: session.offers.filter((o) => o !== action.offer),
            fileError: null,
          }
        : session;
    case "declineOffer":
      return session.offers.includes(action.offer)
        ? { ...session, offers: session.offers.filter((o) => o !== action.offer), fileError: null }
        : session;
    case "newTrip":
      return replace(session, setStartDate(emptyTrip(), action.startDate), "newTrip");
    case "fileOpened":
      return replace(session, action.trip, "openFile");
    case "fileRejected":
      return { ...session, fileError: action.reason };
    case "fileDownloaded":
      return session.fileError === null ? session : { ...session, fileError: null };
    case "enterAccessPointEditing":
      return editingAccessPoints(session)
        ? session
        : {
            ...session,
            mode: { kind: "accessPointEditing", returnTo: action.returnTo },
            selectedPoint: null,
            selectedLeg: null,
          };
    case "leaveAccessPointEditing":
      return editingAccessPoints(session)
        ? { ...session, mode: { kind: "normal" }, selectedPoint: null, selectedLeg: null }
        : session;
  }
}
