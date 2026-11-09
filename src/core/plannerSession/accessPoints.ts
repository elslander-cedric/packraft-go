// The planner session's rules for your access points, the draft and the selected access point (#242).
import {
  addAccessPoint,
  applyDefaultName,
  deleteAccessPoint,
  updateAccessPoint,
  type AccessPoint,
  type AccessPoints,
} from "../accessPoints";
import { distanceM } from "../geo";
import type { SnapOffer } from "../snap";
import type { LatLng, Trip } from "../trip";
import type { AccessPointAction, PlannerSession } from "./types";

/** Offers after your access points changed: deleted ones drop, moved ones follow; official aires never change. */
const followAccessPoints = (trip: Trip, offers: readonly SnapOffer[], accessPoints: AccessPoints): SnapOffer[] =>
  offers.flatMap((offer) => {
    if (offer.target.kind !== "access-point") return [offer];
    const { id } = offer.target.accessPoint;
    const accessPoint = accessPoints.find((a) => a.id === id);
    const at = trip.points[offer.change.point];
    if (!accessPoint || !at) return [];
    if (accessPoint === offer.target.accessPoint) return [offer];
    return [{ ...offer, target: { kind: "access-point", accessPoint }, distanceM: distanceM(at, accessPoint.position) }];
  });

/** Your access points changed: the snap offers follow them. */
const withAccessPoints = (session: PlannerSession, accessPoints: AccessPoints): PlannerSession =>
  accessPoints === session.accessPoints
    ? session
    : { ...session, accessPoints, offers: followAccessPoints(session.trip, session.offers, accessPoints) };

/** Places the draft at `at`, or moves it there (its default name is looked up again); clears the selection. */
export function placeDraft(
  session: PlannerSession,
  { at, newId, now }: { at: LatLng; newId: string; now: string },
): PlannerSession {
  const { draft } = session;
  const placed = draft
    ? updateAccessPoint([draft], draft.id, { position: at }, now)[0]!
    : addAccessPoint([], { id: newId, at, now })[0]!;
  return { ...session, draft: placed, selectedAccessPoint: null };
}

/** A default name found (ADR 0027): given to the stored point or the draft still waiting for it there. */
export function defaultNameFound(
  session: PlannerSession,
  { id, at, name }: { id: string; at: LatLng; name: string },
): PlannerSession {
  const named = withAccessPoints(session, applyDefaultName(session.accessPoints, id, { at, name }));
  const { draft } = session;
  if (draft?.id !== id) return named;
  const namedDraft: AccessPoint = applyDefaultName([draft], id, { at, name })[0]!;
  return namedDraft === draft ? named : { ...named, draft: namedDraft };
}

/** Access point editing's actions; the caller applies them only while editing. */
export function accessPointEdit(session: PlannerSession, action: AccessPointAction): PlannerSession {
  const { accessPoints, draft } = session;
  switch (action.type) {
    case "draftPlaced":
      return placeDraft(session, action);
    case "draftMoved":
      return draft ? placeDraft(session, { at: action.to, newId: draft.id, now: action.now }) : session;
    case "draftSaved":
      if (!draft) return session;
      return {
        ...withAccessPoints(session, updateAccessPoint([...accessPoints, draft], draft.id, action.changes, action.now)),
        draft: null,
        selectedAccessPoint: draft.id,
      };
    case "draftDiscarded":
      return draft ? { ...session, draft: null } : session;
    case "accessPointClicked":
      return accessPoints.some((point) => point.id === action.id)
        ? { ...session, selectedAccessPoint: action.id }
        : session;
    case "accessPointMoved":
      return withAccessPoints(session, updateAccessPoint(accessPoints, action.id, { position: action.to }, action.now));
    case "accessPointUpdated":
      return withAccessPoints(session, updateAccessPoint(accessPoints, action.id, action.changes, action.now));
    case "accessPointDeleted": {
      const after = withAccessPoints(session, deleteAccessPoint(accessPoints, action.id));
      return session.selectedAccessPoint === action.id ? { ...after, selectedAccessPoint: null } : after;
    }
  }
}
