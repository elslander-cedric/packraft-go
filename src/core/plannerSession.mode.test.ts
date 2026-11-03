// Seam: the planner session function (ADR 0025), for its two modes (ADR 0036, #225):
// normal mode and access point editing, entered and left by actions.
import { describe, expect, it } from "vitest";
import { firstSession, plannerSession, type PanelView, type PlannerSession } from "./plannerSession";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const A: LatLng = { lat: 50.3527, lng: 5.4563 };
const B: LatLng = { lat: 50.3627, lng: 5.4563 };
const trip = [A, B].reduce((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());

const daysClosed: PanelView = { tab: "days", sheet: "peek", panelOpen: false };
const selected = (): PlannerSession => ({ ...firstSession({ trip }), selectedPoint: 1 });
const enter = (s: PlannerSession, returnTo: PanelView = daysClosed) =>
  plannerSession(s, { type: "enterAccessPointEditing", returnTo });

describe("planner modes", () => {
  it("the planner opens in normal mode", () => {
    expect(firstSession({ trip }).mode).toEqual({ kind: "normal" });
    expect(firstSession({ trip: emptyTrip(), unknownVersion: true }).mode).toEqual({ kind: "normal" });
  });

  it("entering access point editing keeps the view to return to and clears the selection", () => {
    const before = selected();
    const after = enter(before);
    expect(after.mode).toEqual({ kind: "accessPointEditing", returnTo: daysClosed });
    expect(after.selectedPoint).toBeNull();
    expect(after.trip).toBe(before.trip);
  });

  it("entering again while editing changes nothing", () => {
    const editing = enter(selected());
    expect(enter(editing, { tab: "sections", sheet: "full", panelOpen: true })).toBe(editing);
  });

  it("Done goes back to normal mode and clears the selection", () => {
    const editing = { ...enter(selected()), selectedPoint: 0 };
    const after = plannerSession(editing, { type: "leaveAccessPointEditing" });
    expect(after.mode).toEqual({ kind: "normal" });
    expect(after.selectedPoint).toBeNull();
  });

  it("Done in normal mode changes nothing", () => {
    const s = selected();
    expect(plannerSession(s, { type: "leaveAccessPointEditing" })).toBe(s);
  });

  it("the mode outlasts replacing the trip", () => {
    const editing = enter(firstSession({ trip: emptyTrip() }));
    expect(plannerSession(editing, { type: "newTrip" }).mode).toEqual(editing.mode);
  });
});
