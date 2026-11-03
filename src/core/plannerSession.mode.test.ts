// Seam: the planner session function (ADR 0025), for its two modes (ADR 0036, #225):
// normal mode and access point editing, entered and left by actions. While
// editing access points the trip is frozen (#227).
import { describe, expect, it } from "vitest";
import { addAccessPoint, updateAccessPoint } from "./accessPoints";
import { firstSession, plannerSession, type PanelView, type PlannerAction, type PlannerSession } from "./plannerSession";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const A: LatLng = { lat: 50.3527, lng: 5.4563 };
const B: LatLng = { lat: 50.3627, lng: 5.4563 };
const C: LatLng = { lat: 50.3727, lng: 5.4563 };
const nearA: LatLng = { lat: 50.3532, lng: 5.4563 }; // about 55 m from A
const T = "2026-10-14T08:00:00.000Z";
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

describe("the trip is frozen while editing access points (#227)", () => {
  const slipway = updateAccessPoint(
    addAccessPoint([], { id: "near", at: nearA, now: T }),
    "near",
    { kind: "slipway", use: "both" },
    T,
  );
  const threePoints = [A, B, C].reduce((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());
  /** Editing access points with one snap offer and, as if left from before, point 1 selected. */
  const editing = (): PlannerSession => {
    const withOffer = plannerSession(firstSession({ trip: threePoints }), {
      type: "setLegMode",
      index: 0,
      mode: "paddle",
      accessPoints: slipway,
      officialAires: [],
    });
    expect(withOffer.offers).toHaveLength(1);
    return { ...enter(withOffer), selectedPoint: 1 };
  };

  const frozen: [name: string, make: (s: PlannerSession) => PlannerAction][] = [
    ["add point", () => ({ type: "addPoint", at: { lat: 50.4, lng: 5.5 }, accessPoints: [], officialAires: [] })],
    ["move point", () => ({ type: "movePoint", index: 0, to: { lat: 50.4, lng: 5.5 } })],
    ["delete selected point", () => ({ type: "deleteSelectedPoint" })],
    ["back to start", () => ({ type: "backToStart" })],
    ["insert point", () => ({ type: "insertPoint", index: 0, near: { lat: 50.3577, lng: 5.4563 } })],
    ["set leg mode", () => ({ type: "setLegMode", index: 1, mode: "paddle", accessPoints: [], officialAires: [] })],
    ["toggle camp", () => ({ type: "toggleCampOnSelectedPoint" })],
    ["undo", () => ({ type: "undo" })],
    ["point clicked", () => ({ type: "pointClicked", index: 2 })],
    ["accept offer", (s) => ({ type: "acceptOffer", offer: s.offers[0] })],
    ["decline offer", (s) => ({ type: "declineOffer", offer: s.offers[0] })],
  ];
  for (const [name, make] of frozen) {
    it(`${name} changes nothing`, () => {
      const before = editing();
      expect(plannerSession(before, make(before))).toBe(before);
    });
  }

  it("the snap offers wait for Done, following a moved access point", () => {
    const before = editing();
    const moved = updateAccessPoint(slipway, "near", { position: { lat: 50.3531, lng: 5.4563 } }, T);
    const after = plannerSession(plannerSession(before, { type: "accessPointsChanged", accessPoints: moved }), {
      type: "leaveAccessPointEditing",
    });
    expect(after.offers).toHaveLength(1);
    expect(after.offers[0].target).toEqual({ kind: "access-point", accessPoint: moved[0] });
  });

  it("the trip can change again after Done", () => {
    const done = plannerSession(editing(), { type: "leaveAccessPointEditing" });
    expect(plannerSession(done, { type: "undo" }).trip).not.toBe(done.trip);
  });
});
