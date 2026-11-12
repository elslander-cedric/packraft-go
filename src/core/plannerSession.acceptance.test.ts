// The planner session as one pure function.
import { describe, expect, it } from "vitest";
import { firstSession, plannerSession } from "./plannerSession";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const pointA: LatLng = { lat: 50.35, lng: 5.45 };
const pointB: LatLng = { lat: 50.36, lng: 5.45 };
const withPoints = () =>
  [pointA, pointB].reduce((result, at) => applyEdit(result, { type: "addPoint", at }), emptyTrip());

describe("planner session", () => {
  it("a file error is cleared by other actions", () => {
    const session = plannerSession(firstSession({ trip: withPoints() }), { type: "fileRejected", reason: "invalid" });
    expect(session.fileError).toBe("invalid");
    expect(plannerSession(session, { type: "rename", name: "x" }).fileError).toBeNull();
    expect(plannerSession(session, { type: "retryLeg", index: 0 }).fileError).toBeNull();
    expect(plannerSession(session, { type: "fileDownloaded" }).fileError).toBeNull();
  });
  it("no-ops return the same session", () => {
    const session = firstSession({ trip: withPoints() });
    expect(plannerSession(session, { type: "deleteSelectedPoint" })).toBe(session);
    expect(plannerSession(session, { type: "toggleCampOnSelectedPoint" })).toBe(session);
    expect(plannerSession(session, { type: "confirmReplace" })).toBe(session);
    expect(plannerSession(session, { type: "cancelReplace" })).toBe(session);
  });
  it("empty trip is replaced without question; trip with points asks and cancel keeps it", () => {
    const session = plannerSession(firstSession({ trip: emptyTrip(), unknownVersion: true }), { type: "newTrip" });
    expect(session.pendingTrip).toBeNull();
    expect(session.keepStoredSave).toBe(false);
    const aSession = firstSession({ trip: withPoints(), unknownVersion: true });
    const asked = plannerSession(aSession, { type: "fileOpened", trip: emptyTrip() });
    expect(asked.pendingTrip).not.toBeNull();
    expect(asked.question).toBe("openFile");
    const cancelled = plannerSession(asked, { type: "cancelReplace" });
    expect(cancelled.trip).toBe(aSession.trip);
    expect(cancelled.keepStoredSave).toBe(true);
    expect(plannerSession(asked, { type: "addPoint", at: pointA, accessPoints: [], officialAires: [] })).toBe(asked);
  });
});
