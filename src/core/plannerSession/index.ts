// The planner session (GLOSSARY, ADR 0025): what the planner is working on right
// now, as one pure function `(session, action) -> session`. It is the only
// writer of the trip and of your access points. The planner page runs it with a
// reducer and keeps the side effects (autosave of the trip and of your access
// points, default name lookups, route requests, reading and downloading files,
// key bindings). Ids and times come with the actions, so it stays pure.
//
// One rule per piece of state (see ADR 0025):
// - selected point: cleared by add, move and delete point, back to start, set leg mode, undo,
//   accept offer and any replace of the trip; insert point makes it follow the
//   selected point when the insert shifts its index; leg clicked and map tapped clear it; kept by
//   everything else.
// - selected leg (#230): set by leg clicked (cleared by a click on it again), cleared by point
//   clicked, deselect, map tapped, entering access point editing and every edit of the points, undo,
//   accept offer and any replace; kept by set leg mode, so its mode can be switched back, and by
//   everything else. A selected point and a selected leg never go together.
// - map tapped (#120, #230, #227): while editing access points it places the draft or moves it
//   there; else, with a point or a leg selected, it only clears the selection; else it adds a point
//   in `nextLegMode`.
// - snap offers: set leg mode, add point and move point replace them with the offers worked
//   out from the trip they produced (a move offers only for the moved point); insert, delete,
//   back to start, undo and replace drop them; accept and decline remove that one offer. Every
//   change to your access points (deleted, moved, updated, newly named, a saved draft) drops the
//   offers to a deleted access point, makes the offers to a changed one follow it and leaves the
//   offers to official aires alone. `shownOffers` is empty while editing access points.
// - file error: set by file rejected; cleared by every other action except a route being requested
//   or arriving, the official aires loading, entering and leaving access point editing, the access
//   point actions and a default name found.
// - next mode (#121, #241): the next leg's picked mode, null for none (then `nextLegMode` is the
//   last leg's mode). Set by next mode picked; cleared by every edit of the points or leg modes
//   (add, move, insert and delete point, back to start, set leg mode, toggle camp, undo, accept
//   offer) and any replace; kept by routing and everything else. Add point on an empty trip keeps
//   it, so the first point carries the pick over to the second. Add point and back to start draw
//   their leg in `nextLegMode`.
// - official aires (#241): set by official aires loaded, which applies in any mode and while the
//   replace question is open; kept by everything else, replacing the trip included. Add, move
//   point and set leg mode offer snaps to them; an edit before they load offers none.
// - trip generation (#241): 0 at first; every replace of the trip adds one. The map fits the trip
//   when it changes and the trip has points.
// - stored save kept (#28): cleared when the trip is replaced.
// - your access points (#242, ADR 0023): loaded by `firstSession`; changed by draft saved (the
//   draft is added), access point moved, updated and deleted, and a default name found; kept by
//   everything else. The planner stores them on every change.
// - the draft (#242): the new access point placed on the map, not stored. Map tapped and draft
//   placed place it, or move it when there is one; draft moved moves it; draft saved stores it
//   with its details; draft discarded and leaving access point editing drop it. A default name
//   found for it names it.
// - selected access point (#242): set by access point clicked and draft saved (the stored draft);
//   cleared by entering and leaving access point editing, by placing or moving the draft and by
//   deleting that access point; kept by everything else.
// - panel view (#243): tab chosen sets normal mode's tab, ignored while editing access points,
//   which shows the Access points tab (`shownTab`) and keeps normal mode's tab for Done. Sheet moved
//   sets the sheet's stop in any mode. Entering keeps the stop to restore and opens the panel for
//   the visit; panel toggled opens or closes it only while editing (in normal mode it is a stored
//   setting); Done restores the stop. Kept by everything else.
// - row highlight (#243): set by row tapped (a tap on the highlighted day clears it; on the
//   highlighted leg or section keeps it); cleared by every edit of the points, leg modes or camps
//   (add, move, insert and delete point, back to start, set leg mode, toggle camp, undo, accept
//   offer) and any replace; kept by routing, the map selection, the panel view and everything else.
//   Row tapped is ignored while editing access points.
// - replace question: new trip and file opened ask it when the current trip needs
//   confirmation. While it is open only confirm, cancel, the routing actions, official
//   aires loaded and default name found apply.
// - mode (ADR 0036, #225): normal on load (never stored); enter access point editing sets it and
//   Done sets it back (the panel view is above). Both clear the selection and the
//   selected access point; Done drops the draft.
//   While editing access points the trip is frozen (#227): the actions that edit its points or
//   leg modes, select or deselect a point or a leg or answer a snap offer return the same session;
//   the offers wait for Done (still following your access points). The access point actions apply
//   only while editing.
// Actions that can't apply return the same session.
import type { AccessPoints } from "../accessPoints";
import { applyRoutingAction, type RoutingAction } from "../routing";
import type { SnapOffer } from "../snap";
import type { Trip } from "../trip";
import { accessPointEdit, defaultNameFound, placeDraft } from "./accessPoints";
import { replaced, tripAction } from "./trip";
import type { AccessPointAction, PlannerAction, PlannerSession, PlannerTab } from "./types";

export * from "./types";
export { nextLegMode } from "./trip";

/** Whether the planner is editing access points, so the trip is frozen (#227). */
export const editingAccessPoints = (session: PlannerSession): boolean => session.mode.kind === "accessPointEditing";

const noOffers: readonly SnapOffer[] = [];

/** The panel's tab to show: normal mode's, or the Access points tab while editing access points. */
export const shownTab = (session: PlannerSession): PlannerTab =>
  editingAccessPoints(session) ? "accessPoints" : session.panel.tab;

/** The snap offers to show: none while editing access points, where they wait for Done (#227). */
export const shownOffers = (session: PlannerSession): readonly SnapOffer[] =>
  editingAccessPoints(session) ? noOffers : session.offers;

/** The first session, from what loading the stored trip and your stored access points returned. */
export function firstSession(stored: {
  readonly trip: Trip;
  readonly unknownVersion?: boolean;
  readonly accessPoints?: AccessPoints;
}): PlannerSession {
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
    nextMode: null,
    officialAires: [],
    tripGeneration: 0,
    accessPoints: stored.accessPoints ?? [],
    draft: null,
    selectedAccessPoint: null,
    panel: { tab: "sections", sheetStop: "peek", openWhileEditing: true, sheetStopToRestore: null },
    highlightedRow: null,
  };
}

const routing = (session: PlannerSession, action: RoutingAction): PlannerSession => {
  const trip = applyRoutingAction(session.trip, action);
  return trip === session.trip ? session : { ...session, trip };
};

/** What can't apply while editing access points: the trip is frozen (#227). */
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
  "deselect",
  "acceptOffer",
  "declineOffer",
  "rowTapped",
]);

/** What applies only while editing access points (#242). */
const accessPointActions: ReadonlySet<PlannerAction["type"]> = new Set<AccessPointAction["type"]>([
  "draftPlaced",
  "draftMoved",
  "draftSaved",
  "draftDiscarded",
  "accessPointClicked",
  "accessPointMoved",
  "accessPointUpdated",
  "accessPointDeleted",
]);
const isAccessPointAction = (action: PlannerAction): action is AccessPointAction => accessPointActions.has(action.type);

export function plannerSession(session: PlannerSession, action: PlannerAction): PlannerSession {
  if (action.type === "routeRequested" || action.type === "routeArrived") return routing(session, action);
  if (action.type === "officialAiresLoaded") return { ...session, officialAires: action.aires };
  if (action.type === "defaultNameFound") return defaultNameFound(session, action);
  if (action.type === "confirmReplace") return session.pendingTrip ? replaced(session, session.pendingTrip) : session;
  if (action.type === "cancelReplace") return session.pendingTrip ? { ...session, pendingTrip: null } : session;
  if (session.pendingTrip) return session;

  const editing = editingAccessPoints(session);
  if (isAccessPointAction(action)) return editing ? accessPointEdit(session, action) : session;
  if (editing && frozenWhileEditing.has(action.type)) return session;

  switch (action.type) {
    case "enterAccessPointEditing":
      return editing
        ? session
        : {
            ...session,
            mode: { kind: "accessPointEditing" },
            selectedPoint: null,
            selectedLeg: null,
            selectedAccessPoint: null,
            // The Access points tab at the sheet's stop, the panel open for this visit (ADR 0036).
            panel: { ...session.panel, openWhileEditing: true, sheetStopToRestore: session.panel.sheetStop },
          };
    case "leaveAccessPointEditing":
      return editing
        ? {
            ...session,
            mode: { kind: "normal" },
            selectedPoint: null,
            selectedLeg: null,
            selectedAccessPoint: null,
            draft: null,
            // Normal mode's tab was kept; the sheet goes back to its stop. The panel shows its stored setting.
            panel: {
              ...session.panel,
              sheetStop: session.panel.sheetStopToRestore ?? session.panel.sheetStop,
              sheetStopToRestore: null,
            },
          }
        : session;
    case "tabChosen":
      return editing || session.panel.tab === action.tab
        ? session
        : { ...session, panel: { ...session.panel, tab: action.tab } };
    case "sheetMoved":
      return session.panel.sheetStop === action.stop
        ? session
        : { ...session, panel: { ...session.panel, sheetStop: action.stop } };
    case "panelToggled":
      return !editing || session.panel.openWhileEditing === action.open
        ? session
        : { ...session, panel: { ...session.panel, openWhileEditing: action.open } };
    case "mapTapped":
      return editing ? placeDraft(session, action) : tripAction(session, action);
    default:
      return tripAction(session, action);
  }
}
