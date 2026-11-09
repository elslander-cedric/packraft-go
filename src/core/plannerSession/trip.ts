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
import type { PlannerSession, ReplaceQuestion, TripAction } from "./types";

/** The mode the next leg gets (#121): the planner's pick, else the last leg's mode, hike for a trip without legs. */
export const nextLegMode = (session: PlannerSession): LegMode =>
  session.nextModePick ?? session.trip.legs[session.trip.legs.length - 1]?.mode ?? "hike";

/**
 * An edit of the points, leg modes or camps: the selection, the offers, the next leg's picked mode
 * and the row highlight are dropped. The one place that lists what an edit clears; an edit that
 * keeps some of it (set leg mode, insert point, toggle camp, accept offer) overrides those fields.
 */
const edited = (session: PlannerSession, trip: Trip, offers: readonly SnapOffer[] = []): PlannerSession => ({
  ...session,
  trip,
  selectedPoint: null,
  selectedLeg: null,
  offers,
  fileError: null,
  nextModePick: null,
  highlightedRow: null,
});

/** The trip replaced (New trip, Open trip): what an edit clears, and the stored save and the question too. */
export const replaced = (session: PlannerSession, trip: Trip): PlannerSession => ({
  ...edited(session, trip),
  keepStoredSave: false,
  pendingTrip: null,
  tripGeneration: session.tripGeneration + 1,
});

/** Replaces the trip, asking first when that would lose points (it cannot be undone). */
const replace = (session: PlannerSession, next: Trip, question: ReplaceQuestion): PlannerSession =>
  newTripNeedsConfirmation(session.trip)
    ? { ...session, question, pendingTrip: next, fileError: null }
    : replaced(session, next);

const deselected = (session: PlannerSession): PlannerSession => ({
  ...session,
  selectedPoint: null,
  selectedLeg: null,
  fileError: null,
});

export function tripAction(session: PlannerSession, action: TripAction): PlannerSession {
  const { trip, accessPoints, officialAires } = session;
  switch (action.type) {
    case "addPoint": {
      const after = applyEdit(trip, { type: "addPoint", at: action.at, mode: nextLegMode(session) });
      const next = edited(session, after, snapOffers(trip, after, accessPoints, officialAires));
      // The first point adds no leg: the pick carries over to the second.
      return trip.points.length === 0 ? { ...next, nextModePick: session.nextModePick } : next;
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
            // An edit with its own undo step: a camp can shift the days' indexes, so the row
            // highlight and the next leg's pick go. The points don't move: the selection and the
            // offers stay.
            ...edited(session, applyEdit(trip, { type: "toggleCamp", index: session.selectedPoint }), session.offers),
            selectedPoint: session.selectedPoint,
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
        ? edited(
            session,
            acceptSnap(trip, action.offer),
            session.offers.filter((o) => o !== action.offer),
          )
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
      return { ...session, nextModePick: action.mode, fileError: null };
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
