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

const withTripReplaced = (session: PlannerSession, trip: Trip): PlannerSession => ({
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
const replaceTripOrAsk = (session: PlannerSession, next: Trip, question: ReplaceQuestion): PlannerSession =>
  newTripNeedsConfirmation(session.trip)
    ? { ...session, question, pendingTrip: next, fileError: null }
    : withTripReplaced(session, next);

/** An edit of the points or leg modes: selection and offers are dropped. */
const withTripEdited = (session: PlannerSession, trip: Trip, offers: readonly SnapOffer[] = []): PlannerSession => ({
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
    const accessPoint = accessPoints.find((accessPoint) => accessPoint.id === id);
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

/** A change to the trip that keeps the selection and the offers. */
const withTrip = (session: PlannerSession, trip: Trip): PlannerSession => ({ ...session, trip, fileError: null });

const withRoutingApplied = (session: PlannerSession, action: RoutingAction): PlannerSession => {
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

/** The replace question is open: only its answers and the routing actions apply until it is answered. */
const appliesWhileAsking: ReadonlySet<PlannerAction["type"]> = new Set([
  "routeRequested",
  "routeArrived",
  "confirmReplace",
  "cancelReplace",
]);

export function plannerSession(session: PlannerSession, action: PlannerAction): PlannerSession {
  const waitsForAnswer = session.pendingTrip !== null && !appliesWhileAsking.has(action.type);
  const frozen = editingAccessPoints(session) && frozenWhileEditing.has(action.type);
  if (waitsForAnswer || frozen) {
    return session;
  }
  const handle = handlers[action.type] as (session: PlannerSession, action: PlannerAction) => PlannerSession;
  return handle(session, action);
}

type Handlers = {
  [Type in PlannerAction["type"]]: (
    session: PlannerSession,
    action: Extract<PlannerAction, { type: Type }>,
  ) => PlannerSession;
};

const withoutSelection = { selectedPoint: null, selectedLeg: null } as const;

/** What each action does to the session. One that can't apply returns the same session. */
const handlers: Handlers = {
  routeRequested: withRoutingApplied,
  routeArrived: withRoutingApplied,

  confirmReplace: (session) => (session.pendingTrip ? withTripReplaced(session, session.pendingTrip) : session),
  cancelReplace: (session) => (session.pendingTrip ? { ...session, pendingTrip: null } : session),

  addPoint: (session, { at, mode, accessPoints, officialAires }) => {
    const after = applyEdit(session.trip, { type: "addPoint", at, mode });
    return withTripEdited(session, after, snapOffers(session.trip, after, accessPoints, officialAires));
  },
  movePoint: (session, { index, to, accessPoints, officialAires }) => {
    const after = applyEdit(session.trip, { type: "movePoint", index, to });
    return withTripEdited(session, after, movedPointOffers(after, index, accessPoints, officialAires));
  },
  backToStart: (session, { mode }) => {
    const { trip } = session;
    if (!canGoBackToStart(trip)) {
      return session;
    }
    return withTripEdited(session, applyEdit(trip, { type: "addPoint", at: trip.points[0], mode }));
  },
  insertPoint: (session, action) => {
    const after = applyEdit(session.trip, action);
    if (after === session.trip) {
      return session;
    }
    const selected = session.selectedPoint;
    // The selection follows its point: a point after the insert moves up by one.
    const follows = selected !== null && selected > action.index ? selected + 1 : selected;
    return { ...withTripEdited(session, after), selectedPoint: follows };
  },
  deleteSelectedPoint: (session) =>
    session.selectedPoint === null
      ? session
      : withTripEdited(session, applyEdit(session.trip, { type: "deletePoint", index: session.selectedPoint })),
  setLegMode: (session, { index, mode, accessPoints, officialAires }) => {
    const after = applyEdit(session.trip, { type: "setLegMode", index, mode });
    const offers = snapOffers(session.trip, after, accessPoints, officialAires);
    // The legs keep their indices: the selected leg stays selected.
    return { ...withTripEdited(session, after, offers), selectedLeg: session.selectedLeg };
  },
  toggleCampOnSelectedPoint: (session) =>
    session.selectedPoint === null
      ? session
      : withTrip(session, applyEdit(session.trip, { type: "toggleCamp", index: session.selectedPoint })),
  undo: (session) => withTripEdited(session, applyEdit(session.trip, { type: "undo" })),
  rename: (session, { name }) => withTrip(session, renameTrip(session.trip, name)),
  setStartDate: (session, { date }) => withTrip(session, setStartDate(session.trip, date)),
  retryLeg: (session, { index }) => withTrip(session, retryLeg(session.trip, index)),

  accessPointsChanged: (session, { accessPoints }) => ({
    ...session,
    offers: followAccessPoints(session.trip, session.offers, accessPoints),
    fileError: null,
  }),
  acceptOffer: (session, { offer }) =>
    session.offers.includes(offer)
      ? {
          ...withTrip(session, acceptSnap(session.trip, offer)),
          ...withoutSelection,
          offers: session.offers.filter((other) => other !== offer),
        }
      : session,
  declineOffer: (session, { offer }) =>
    session.offers.includes(offer)
      ? { ...session, offers: session.offers.filter((other) => other !== offer), fileError: null }
      : session,

  // A click on the selected point or leg unselects it.
  pointClicked: (session, { index }) => ({
    ...session,
    selectedPoint: session.selectedPoint === index ? null : index,
    selectedLeg: null,
    fileError: null,
  }),
  legClicked: (session, { index }) =>
    session.trip.legs[index]
      ? { ...session, selectedLeg: session.selectedLeg === index ? null : index, selectedPoint: null, fileError: null }
      : session,
  deselect: (session) => ({ ...session, ...withoutSelection, fileError: null }),

  newTrip: (session, { startDate }) => replaceTripOrAsk(session, setStartDate(emptyTrip(), startDate), "newTrip"),
  fileOpened: (session, { trip }) => replaceTripOrAsk(session, trip, "openFile"),
  fileRejected: (session, { reason }) => ({ ...session, fileError: reason }),
  fileDownloaded: (session) => (session.fileError === null ? session : { ...session, fileError: null }),

  enterAccessPointEditing: (session, { returnTo }) =>
    editingAccessPoints(session)
      ? session
      : { ...session, mode: { kind: "accessPointEditing", returnTo }, ...withoutSelection },
  leaveAccessPointEditing: (session) =>
    editingAccessPoints(session) ? { ...session, mode: { kind: "normal" }, ...withoutSelection } : session,
};
