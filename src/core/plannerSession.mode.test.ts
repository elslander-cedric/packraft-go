// Seam: the planner session function (ADR 0025), for its modes (ADR 0036, ADR 0039):
// normal mode, access point editing and showing suggested trips, entered and left by
// actions. Outside normal mode the trip is frozen.
import { describe, expect, it } from "vitest";
import { addAccessPoint, updateAccessPoint } from "./accessPoints";
import { firstSession, plannerSession, type PanelView, type PlannerAction, type PlannerSession } from "./plannerSession";
import type { SuggestedTrip } from "./suggestedTrips";
import { applyEdit, emptyTrip, type LatLng } from "./trip";

const A: LatLng = { lat: 50.3527, lng: 5.4563 };
const B: LatLng = { lat: 50.3627, lng: 5.4563 };
const C: LatLng = { lat: 50.3727, lng: 5.4563 };
const nearA: LatLng = { lat: 50.3532, lng: 5.4563 }; // about 55 m from A
const T = "2026-10-14T08:00:00.000Z";
const trip = [A, B].reduce((t, at) => applyEdit(t, { type: "addPoint", at }), emptyTrip());

const daysPeek: PanelView = { tab: "days", sheet: "peek" };
const selected = (): PlannerSession => ({ ...firstSession({ trip }), selectedPoint: 1 });
const enter = (s: PlannerSession, returnTo: PanelView = daysPeek) =>
  plannerSession(s, { type: "enterAccessPointEditing", returnTo });
const showSuggestedTrips = (s: PlannerSession, returnTo: PanelView = daysPeek) =>
  plannerSession(s, { type: "showSuggestedTrips", returnTo });

describe("planner modes", () => {
  it("the planner opens in normal mode", () => {
    expect(firstSession({ trip }).mode).toEqual({ kind: "normal" });
    expect(firstSession({ trip: emptyTrip(), unknownVersion: true }).mode).toEqual({ kind: "normal" });
  });

  it("entering access point editing keeps the view to return to and clears the selection", () => {
    const before = selected();
    const after = enter(before);
    expect(after.mode).toEqual({ kind: "accessPointEditing", returnTo: daysPeek });
    expect(after.selectedPoint).toBeNull();
    expect(after.trip).toBe(before.trip);
  });

  it("entering again while editing changes nothing", () => {
    const editing = enter(selected());
    expect(enter(editing, { tab: "sections", sheet: "full" })).toBe(editing);
  });

  it("Done goes back to normal mode and clears the selection", () => {
    const editing = { ...enter(selected()), selectedPoint: 0 };
    const after = plannerSession(editing, { type: "leaveAccessPointEditing" });
    expect(after.mode).toEqual({ kind: "normal" });
    expect(after.selectedPoint).toBeNull();
  });

  it("entering access point editing clears the selected leg (#230)", () => {
    const before = { ...firstSession({ trip }), selectedLeg: 0 };
    expect(enter(before).selectedLeg).toBeNull();
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

describe("showing suggested trips", () => {
  it("showing them keeps the view to return to and clears the selection", () => {
    const before = { ...firstSession({ trip }), selectedLeg: 0 };
    const after = showSuggestedTrips(before);
    expect(after.mode).toEqual({ kind: "suggestedTrips", returnTo: daysPeek });
    expect(after.selectedLeg).toBeNull();
    expect(after.trip).toBe(before.trip);
  });

  it("closing them goes back to normal mode with the trip as it was", () => {
    const before = selected();
    const after = plannerSession(showSuggestedTrips(before), { type: "closeSuggestedTrips" });
    expect(after.mode).toEqual({ kind: "normal" });
    expect(after.trip).toBe(before.trip);
  });

  it("closing them in normal mode changes nothing", () => {
    const s = selected();
    expect(plannerSession(s, { type: "closeSuggestedTrips" })).toBe(s);
  });

  it("they can't be shown while editing access points, nor access points edited while they are shown", () => {
    const editing = enter(selected());
    expect(showSuggestedTrips(editing)).toBe(editing);
    expect(plannerSession(editing, { type: "closeSuggestedTrips" })).toBe(editing);
    const showing = showSuggestedTrips(selected());
    expect(enter(showing)).toBe(showing);
    expect(plannerSession(showing, { type: "leaveAccessPointEditing" })).toBe(showing);
  });

  it("they outlast New trip and Open trip, as access point editing does", () => {
    const showing = showSuggestedTrips(firstSession({ trip: emptyTrip() }));
    expect(plannerSession(showing, { type: "newTrip" }).mode).toEqual(showing.mode);
    expect(plannerSession(showing, { type: "fileOpened", trip }).mode).toEqual(showing.mode);
  });
});

describe("using a suggested trip", () => {
  const suggestedTrip: SuggestedTrip = {
    shape: "one-way",
    nodes: [
      { id: "official-aire-1", kind: "official-aire", use: "both", position: [C.lng, C.lat] },
      { id: "official-aire-2", kind: "official-aire", use: "both", position: [5.4663, 50.3827] },
    ],
    legs: [
      {
        mode: "paddle",
        from: "official-aire-1",
        to: "official-aire-2",
        distanceM: 1500,
        waters: ["River"],
        records: ["walloon-1A2"],
        obstacles: [],
        line: [
          [C.lng, C.lat],
          [5.4663, 50.3827],
        ],
      },
    ],
    hikeM: 0,
    paddleM: 1500,
    climbM: 0,
    descentM: 0,
    trailShare: 0,
    roadShare: 0,
    timeH: 0.3,
    switches: 2,
  };
  const use: PlannerAction = { type: "useSuggestedTrip", suggestedTrip, date: "2027-07-10" };
  const used = { name: "", points: [C, { lat: 50.3827, lng: 5.4663 }], legs: [{ mode: "paddle" }], startDate: "2027-07-10" };

  it("with a trip open asks the usual replace question, still showing the suggested trips", () => {
    const after = plannerSession(showSuggestedTrips(firstSession({ trip })), use);
    expect(after.question).toBe("useSuggestedTrip");
    expect(after.pendingTrip).toEqual(used);
    expect(after.trip).toBe(trip);
    expect(after.mode.kind).toBe("suggestedTrips");
  });

  it("confirming makes it the trip and goes back to normal mode", () => {
    const asked = plannerSession(showSuggestedTrips(firstSession({ trip })), use);
    const after = plannerSession(asked, { type: "confirmReplace" });
    expect(after.trip).toEqual(used);
    expect(after.pendingTrip).toBeNull();
    expect(after.mode).toEqual({ kind: "normal" });
  });

  it("cancelling keeps the trip and the suggested trips", () => {
    const showing = showSuggestedTrips(firstSession({ trip }));
    const after = plannerSession(plannerSession(showing, use), { type: "cancelReplace" });
    expect(after.trip).toBe(trip);
    expect(after.mode).toEqual(showing.mode);
  });

  it("without a trip open makes it the trip at once and goes back to normal mode", () => {
    const after = plannerSession(showSuggestedTrips(firstSession({ trip: emptyTrip() })), use);
    expect(after.trip).toEqual(used);
    expect(after.pendingTrip).toBeNull();
    expect(after.mode).toEqual({ kind: "normal" });
  });

  it("changes nothing unless suggested trips are shown", () => {
    const normal = firstSession({ trip: emptyTrip() });
    expect(plannerSession(normal, use)).toBe(normal);
    const editing = enter(normal);
    expect(plannerSession(editing, use)).toBe(editing);
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
    [
      "move point",
      () => ({ type: "movePoint", index: 0, to: { lat: 50.4, lng: 5.5 }, accessPoints: [], officialAires: [] }),
    ],
    ["delete selected point", () => ({ type: "deleteSelectedPoint" })],
    ["back to start", () => ({ type: "backToStart" })],
    ["insert point", () => ({ type: "insertPoint", index: 0, near: { lat: 50.3577, lng: 5.4563 } })],
    ["set leg mode", () => ({ type: "setLegMode", index: 1, mode: "paddle", accessPoints: [], officialAires: [] })],
    ["toggle camp", () => ({ type: "toggleCampOnSelectedPoint" })],
    ["undo", () => ({ type: "undo" })],
    ["point clicked", () => ({ type: "pointClicked", index: 2 })],
    ["leg clicked", () => ({ type: "legClicked", index: 0 })],
    ["accept offer", (s) => ({ type: "acceptOffer", offer: s.offers[0] })],
    ["decline offer", (s) => ({ type: "declineOffer", offer: s.offers[0] })],
  ];
  for (const [name, make] of frozen) {
    it(`${name} changes nothing`, () => {
      const before = editing();
      expect(plannerSession(before, make(before))).toBe(before);
    });
    it(`${name} changes nothing while suggested trips are shown`, () => {
      const normal = plannerSession(editing(), { type: "leaveAccessPointEditing" });
      const before = { ...showSuggestedTrips(normal), selectedPoint: 1 };
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
