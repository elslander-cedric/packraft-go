// The planner session's rules for the trip: its edits, the selection, the snap offers, the next
// leg's mode and replacing it (New trip, Open trip).
import { retryLeg } from "../routing";
import { acceptSnap, movedPointOffers, snapOffers, type SnapOffer } from "../snap";
import {
  applyEdit,
  canGoBackToStart,
  emptyTrip,
  newTripNeedsConfirmation,
  renameTrip,
  setStartDate,
  type LegMode,
  type Trip,
} from "../trip";
import type { AccessPointAction, PlannerAction, PlannerSession, ReplaceQuestion } from "./types";

/** The mode the next leg gets (#121): the planner's pick, else the last leg's mode, hike for a trip without legs. */
export const nextLegMode = (session: PlannerSession): LegMode =>
  session.nextMode ?? session.trip.legs[session.trip.legs.length - 1]?.mode ?? "hike";

export const replaced = (session: PlannerSession, trip: Trip): PlannerSession => ({
  ...session,
  trip,
  selectedPoint: null,
  selectedLeg: null,
  offers: [],
  fileError: null,
  keepStoredSave: false,
  pendingTrip: null,
  nextMode: null,
  tripGeneration: session.tripGeneration + 1,
  highlightedRow: null,
});

/** Replaces the trip, asking first when that would lose points (it cannot be undone). */
const replace = (session: PlannerSession, next: Trip, question: ReplaceQuestion): PlannerSession =>
  newTripNeedsConfirmation(session.trip)
    ? { ...session, question, pendingTrip: next, fileError: null }
    : replaced(session, next);

/** An edit of the points or leg modes: selection, offers and the next leg's picked mode are dropped. */
const edited = (session: PlannerSession, trip: Trip, offers: readonly SnapOffer[] = []): PlannerSession => ({
  ...session,
  trip,
  selectedPoint: null,
  selectedLeg: null,
  offers,
  fileError: null,
  nextMode: null,
  highlightedRow: null,
});

const deselected = (session: PlannerSession): PlannerSession => ({
  ...session,
  selectedPoint: null,
  selectedLeg: null,
  fileError: null,
});

/** The actions about the trip, in normal mode or while the trip is frozen ones are filtered out by the caller. */
export type TripAction = Exclude<
  PlannerAction,
  | AccessPointAction
  | { type: "routeRequested" | "routeArrived" | "officialAiresLoaded" | "defaultNameFound" }
  | { type: "confirmReplace" | "cancelReplace" | "enterAccessPointEditing" | "leaveAccessPointEditing" }
  | { type: "tabChosen" | "sheetMoved" | "panelToggled" }
>;

export function tripAction(session: PlannerSession, action: TripAction): PlannerSession {
  const { trip, accessPoints, officialAires } = session;
  switch (action.type) {
    case "addPoint": {
      const after = applyEdit(trip, { type: "addPoint", at: action.at, mode: nextLegMode(session) });
      const next = edited(session, after, snapOffers(trip, after, accessPoints, officialAires));
      // The first point adds no leg: the pick carries over to the second.
      return trip.points.length === 0 ? { ...next, nextMode: session.nextMode } : next;
    }
    case "mapTapped":
      // Normal mode: a tap with a point or a leg selected only clears the selection (#120, #230).
      return session.selectedPoint !== null || session.selectedLeg !== null
        ? deselected(session)
        : tripAction(session, { type: "addPoint", at: action.at });
    case "movePoint": {
      const after = applyEdit(trip, { type: "movePoint", index: action.index, to: action.to });
      return edited(session, after, movedPointOffers(after, action.index, accessPoints, officialAires));
    }
    case "backToStart":
      if (!canGoBackToStart(trip)) return session;
      return edited(session, applyEdit(trip, { type: "addPoint", at: trip.points[0], mode: nextLegMode(session) }));
    case "insertPoint": {
      const after = applyEdit(trip, action);
      if (after === trip) return session;
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
      const offers = snapOffers(trip, after, accessPoints, officialAires);
      // The legs keep their indices: the selected leg stays selected.
      return { ...edited(session, after, offers), selectedLeg: session.selectedLeg };
    }
    case "toggleCampOnSelectedPoint":
      return session.selectedPoint === null
        ? session
        : {
            ...session,
            trip: applyEdit(trip, { type: "toggleCamp", index: session.selectedPoint }),
            fileError: null,
            nextMode: null,
            highlightedRow: null,
          };
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
      if (!trip.legs[action.index]) return session;
      return {
        ...session,
        selectedLeg: session.selectedLeg === action.index ? null : action.index,
        selectedPoint: null,
        fileError: null,
      };
    case "deselect":
      return deselected(session);
    case "acceptOffer":
      return session.offers.includes(action.offer)
        ? {
            ...session,
            trip: acceptSnap(trip, action.offer),
            selectedPoint: null,
            selectedLeg: null,
            offers: session.offers.filter((o) => o !== action.offer),
            fileError: null,
            nextMode: null,
            highlightedRow: null,
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
    case "nextModePicked":
      return { ...session, nextMode: action.mode, fileError: null };
    case "rowTapped": {
      const { row } = action;
      const current = session.highlightedRow;
      const same = current?.kind === row.kind && current.index === row.index;
      // A tap on the highlighted day clears it; on the highlighted leg or section it keeps it (#200).
      if (same) return row.kind === "day" ? { ...session, highlightedRow: null } : session;
      return { ...session, highlightedRow: row };
    }
  }
}
