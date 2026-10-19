// Acceptance tests for #96 (spec #94, ADR 0025), written from the ticket, not the diff.
import { describe, expect, it } from "vitest";
import { firstSession, plannerSession } from "./plannerSession";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const A: LatLng = { lat: 50.35, lng: 5.45 };
const B: LatLng = { lat: 50.36, lng: 5.45 };
const withPoints = () => [A, B].reduce((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());

describe("#96 acceptance", () => {
  it("a file error is cleared by other actions", () => {
    const s = plannerSession(firstSession({ trip: withPoints() }), { type: "fileRejected", reason: "invalid" });
    expect(s.fileError).toBe("invalid");
    expect(plannerSession(s, { type: "rename", name: "x" }).fileError).toBeNull();
    expect(plannerSession(s, { type: "retryLeg", index: 0 }).fileError).toBeNull();
    expect(plannerSession(s, { type: "fileDownloaded" }).fileError).toBeNull();
  });
  it("no-ops return the same session", () => {
    const s = firstSession({ trip: withPoints() });
    expect(plannerSession(s, { type: "deleteSelectedPoint" })).toBe(s);
    expect(plannerSession(s, { type: "toggleCampOnSelectedPoint" })).toBe(s);
    expect(plannerSession(s, { type: "confirmReplace" })).toBe(s);
    expect(plannerSession(s, { type: "cancelReplace" })).toBe(s);
  });
  it("empty trip is replaced without question; trip with points asks and cancel keeps it", () => {
    const e = plannerSession(firstSession({ trip: emptyTrip(), unknownVersion: true }), { type: "newTrip" });
    expect(e.pendingTrip).toBeNull();
    expect(e.keepStoredSave).toBe(false);
    const s = firstSession({ trip: withPoints(), unknownVersion: true });
    const asked = plannerSession(s, { type: "fileOpened", trip: emptyTrip() });
    expect(asked.pendingTrip).not.toBeNull();
    expect(asked.question).toBe("openFile");
    const c = plannerSession(asked, { type: "cancelReplace" });
    expect(c.trip).toBe(s.trip);
    expect(c.keepStoredSave).toBe(true);
    expect(plannerSession(asked, { type: "addPoint", at: A })).toBe(asked);
  });
});
