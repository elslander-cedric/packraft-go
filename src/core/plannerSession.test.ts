// Seam: the planner session function (ADR 0025, spec #94). Tests send actions and
// check the session that comes out. The rule tables follow ADR 0025: one table per
// piece of state, one row per action saying cleared / kept / set.
import { describe, expect, it } from "vitest";
import { addAccessPoint, updateAccessPoint, type AccessPoints } from "./accessPoints";
import type { OfficialAire } from "./officialAire";
import { firstSession, nextLegMode, plannerSession, type PlannerAction, type PlannerSession } from "./plannerSession";
import type { LegRoute } from "./router";
import type { RouteRequest } from "./routing";
import type { SnapOffer } from "./snap";
import { applyEdit, emptyTrip, type LatLng, type Trip } from "./trip";

const T = "2026-10-14T08:00:00.000Z";
const A: LatLng = { lat: 50.3527, lng: 5.4563 };
const B: LatLng = { lat: 50.3627, lng: 5.4563 };
const C: LatLng = { lat: 50.3727, lng: 5.4563 };
const nearA: LatLng = { lat: 50.3532, lng: 5.4563 }; // about 55 m from A

const through = (...points: LatLng[]) =>
  points.reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip());

const slipway = (id: string, at: LatLng): AccessPoints =>
  updateAccessPoint(addAccessPoint([], { id, at, now: T }), id, { kind: "slipway", use: "both" }, T);

const run = (session: PlannerSession, ...actions: PlannerAction[]) => actions.reduce(plannerSession, session);

const requestOfLeg = (trip: Trip, i: number): RouteRequest => ({
  mode: trip.legs[i].mode,
  points: [trip.points[i], trip.points[i + 1]],
});
const routed: LegRoute = { status: "routed", geometry: [{ ...A, elevation: 100 }, { ...B, elevation: 120 }] };
const access = slipway("near", nearA);
const officialAire: OfficialAire = {
  id: "official-aire-1",
  number: 1,
  name: "Aire de test",
  use: "both",
  officialStretch: "OURTHE1",
  position: [nearA.lng, nearA.lat],
  lastChanged: "2016-05-02",
  source: { title: "SPW", url: "https://example.test" },
  snapshot: "2026-11-02",
};
const accessPointOf = ({ target }: SnapOffer) => {
  if (target.kind !== "access-point") throw new Error("not an access point");
  return target.accessPoint;
};
const targetId = (offer: SnapOffer) => accessPointOf(offer).id;

/**
 * A session with something in every piece of state: point 1 selected, one snap
 * offer, a file error, a stored save that is kept, and a trip with undo history.
 */
const busy = (): PlannerSession => {
  const first = firstSession({ trip: through(A, B, C), unknownVersion: true });
  const withOffer = plannerSession(first, { type: "setLegMode", index: 0, mode: "paddle", accessPoints: access });
  expect(withOffer.offers).toHaveLength(1);
  return { ...withOffer, selectedPoint: 1, fileError: "invalid" };
};

type Make = PlannerAction | ((session: PlannerSession) => PlannerAction);
const build = (make: Make, session: PlannerSession) => (typeof make === "function" ? make(session) : make);

// Every action that applies to a busy session while no question is open.
const actions: [name: string, make: Make][] = [
  ["add point", { type: "addPoint", at: { lat: 50.4, lng: 5.5 }, accessPoints: [] }],
  [
    "move point",
    { type: "movePoint", index: 0, to: { lat: 50.4, lng: 5.5 }, accessPoints: access },
  ],
  ["delete selected point", { type: "deleteSelectedPoint" }],
  ["back to start", { type: "backToStart" }],
  ["insert point", { type: "insertPoint", index: 0, near: { lat: 50.3577, lng: 5.4563 } }],
  ["set leg mode", { type: "setLegMode", index: 1, mode: "paddle", accessPoints: [] }],
  ["access points changed", { type: "accessPointsChanged", accessPoints: access }],
  ["toggle camp", { type: "toggleCampOnSelectedPoint" }],
  ["undo", { type: "undo" }],
  ["rename", { type: "rename", name: "Ourthe" }],
  ["set start date", { type: "setStartDate", date: "2026-10-20" }],
  ["retry leg", { type: "retryLeg", index: 0 }],
  ["point clicked", { type: "pointClicked", index: 2 }],
  ["leg clicked", { type: "legClicked", index: 0 }],
  ["deselect", { type: "deselect" }],
  ["accept offer", (s) => ({ type: "acceptOffer", offer: s.offers[0] })],
  ["decline offer", (s) => ({ type: "declineOffer", offer: s.offers[0] })],
  ["file downloaded", { type: "fileDownloaded" }],
  ["enter access point editing", { type: "enterAccessPointEditing", returnTo: { tab: "sections", sheet: "peek" } }],
  ["next mode picked", { type: "nextModePicked", mode: "hike" }],
  ["official aires loaded", { type: "officialAiresLoaded", aires: [officialAire] }],
  ["route requested", (s) => ({ type: "routeRequested", request: requestOfLeg(s.trip, 1) })],
  ["route arrived", (s) => ({ type: "routeArrived", request: requestOfLeg(s.trip, 1), route: routed })],
];

type Outcome = { label: "cleared" | "kept" | "set"; value: unknown };
const cleared = (value: unknown): Outcome => ({ label: "cleared", value });
const kept = (value: unknown): Outcome => ({ label: "kept", value });
const set = (value: unknown): Outcome => ({ label: "set", value });

/** One table per piece of state: a row per action, checked against what `read` shows. */
function table(
  piece: string,
  outcomes: Record<string, Outcome>,
  read: (s: PlannerSession) => unknown,
  start: () => PlannerSession = busy,
) {
  describe(`rule table: ${piece}`, () => {
    it("has a row for every action", () => {
      const skipped = actions.map(([name]) => name).filter((name) => !(name in outcomes) && name !== "set leg mode");
      expect(skipped).toEqual([]);
    });
    for (const [name, make] of actions) {
      const outcome = outcomes[name];
      if (!outcome) continue;
      it(`${name}: ${outcome.label}`, () => {
        const before = start();
        expect(read(plannerSession(before, build(make, before)))).toEqual(outcome.value);
      });
    }
  });
}

table(
  "selected point (point 1 is selected)",
  {
    "add point": cleared(null),
    "move point": cleared(null),
    "delete selected point": cleared(null),
    "back to start": cleared(null),
    "insert point": set(2), // follows point 1, which is now point 2
    "set leg mode": cleared(null),
    "access points changed": kept(1),
    "toggle camp": kept(1),
    undo: cleared(null),
    rename: kept(1),
    "set start date": kept(1),
    "retry leg": kept(1),
    "point clicked": set(2),
    "leg clicked": cleared(null),
    deselect: cleared(null),
    "accept offer": cleared(null),
    "decline offer": kept(1),
    "file downloaded": kept(1),
    "enter access point editing": cleared(null),
    "next mode picked": kept(1),
    "official aires loaded": kept(1),
    "route requested": kept(1),
    "route arrived": kept(1),
  },
  (s) => s.selectedPoint,
);

// Set leg mode, add point and move point set the offers; their rows are in "snap offers from ..." below.
table(
  "snap offers (one offer is listed)",
  {
    "add point": cleared([]), // replaced by its own offers, none here
    "move point": cleared([]), // replaced by its own offers, none this far away
    "delete selected point": cleared([]),
    "back to start": cleared([]), // the closing point gets no offer of its own
    "insert point": cleared([]),
    undo: cleared([]),
    "access points changed": kept(1),
    "toggle camp": kept(1),
    rename: kept(1),
    "set start date": kept(1),
    "retry leg": kept(1),
    "point clicked": kept(1),
    "leg clicked": kept(1),
    deselect: kept(1),
    "accept offer": cleared([]), // that one offer is removed
    "decline offer": cleared([]), // that one offer is removed
    "file downloaded": kept(1),
    "enter access point editing": kept(1),
    "next mode picked": kept(1),
    "official aires loaded": kept(1),
    "route requested": kept(1),
    "route arrived": kept(1),
  },
  (s) => (s.offers.length === 1 ? 1 : s.offers),
);

table(
  "file error (an error is shown)",
  {
    "add point": cleared(null),
    "move point": cleared(null),
    "delete selected point": cleared(null),
    "back to start": cleared(null),
    "insert point": cleared(null),
    "set leg mode": cleared(null),
    "access points changed": cleared(null),
    "toggle camp": cleared(null),
    undo: cleared(null),
    rename: cleared(null),
    "set start date": cleared(null),
    "retry leg": cleared(null),
    "point clicked": cleared(null),
    "leg clicked": cleared(null),
    deselect: cleared(null),
    "accept offer": cleared(null),
    "decline offer": cleared(null),
    "file downloaded": cleared(null),
    "enter access point editing": kept("invalid"),
    "next mode picked": cleared(null),
    "official aires loaded": kept("invalid"), // data arriving, like a route
    "route requested": kept("invalid"),
    "route arrived": kept("invalid"),
  },
  (s) => s.fileError,
);

// A selected leg and a selected point never go together: this session has leg 1 selected instead (#230).
const legSelected = (): PlannerSession => ({ ...busy(), selectedPoint: null, selectedLeg: 1 });

table(
  "selected leg (leg 1 is selected)",
  {
    "add point": cleared(null),
    "move point": cleared(null),
    "delete selected point": kept(1), // no point is selected: nothing happens
    "back to start": cleared(null),
    "insert point": cleared(null),
    "set leg mode": kept(1), // legs keep their indices, so you can switch it back
    "access points changed": kept(1),
    "toggle camp": kept(1), // no point is selected: nothing happens
    undo: cleared(null),
    rename: kept(1),
    "set start date": kept(1),
    "retry leg": kept(1),
    "point clicked": cleared(null),
    "leg clicked": set(0),
    deselect: cleared(null),
    "accept offer": cleared(null),
    "decline offer": kept(1),
    "file downloaded": kept(1),
    "enter access point editing": cleared(null),
    "next mode picked": kept(1),
    "official aires loaded": kept(1),
    "route requested": kept(1),
    "route arrived": kept(1),
  },
  (s) => s.selectedLeg,
  legSelected,
);

describe("leg clicked (#230)", () => {
  it("selects the leg and clears the selected point", () => {
    const after = plannerSession(busy(), { type: "legClicked", index: 1 });
    expect(after.selectedLeg).toBe(1);
    expect(after.selectedPoint).toBeNull();
  });

  it("on the selected leg clears it", () => {
    expect(plannerSession(legSelected(), { type: "legClicked", index: 1 }).selectedLeg).toBeNull();
  });

  it("on a leg the trip doesn't have returns the same session", () => {
    const before = legSelected();
    expect(plannerSession(before, { type: "legClicked", index: 2 })).toBe(before);
  });

  it("set leg mode on the selected leg changes its mode and keeps it selected, as one undo step", () => {
    const after = plannerSession(legSelected(), {
      type: "setLegMode",
      index: 1,
      mode: "paddle",
      accessPoints: [],
    });
    expect(after.trip.legs[1].mode).toBe("paddle");
    expect(after.selectedLeg).toBe(1);
    expect(plannerSession(after, { type: "undo" }).trip.legs[1].mode).toBe("hike");
  });

  it("starts cleared", () => {
    expect(firstSession({ trip: through(A, B, C) }).selectedLeg).toBeNull();
  });
});

// The next leg's mode (#121): the busy trip's legs are hike, and paddle is picked.
const paddlePicked = (): PlannerSession => plannerSession(busy(), { type: "nextModePicked", mode: "paddle" });

table(
  "next mode (paddle is picked)",
  {
    "add point": cleared(null), // the new leg is paddle; the next one follows it
    "move point": cleared(null),
    "delete selected point": cleared(null),
    "back to start": cleared(null),
    "insert point": cleared(null),
    "set leg mode": cleared(null),
    "access points changed": kept("paddle"),
    "toggle camp": cleared(null), // an edit too, with its own undo step
    undo: cleared(null),
    rename: kept("paddle"),
    "set start date": kept("paddle"),
    "retry leg": kept("paddle"),
    "point clicked": kept("paddle"),
    "leg clicked": kept("paddle"),
    deselect: kept("paddle"),
    "accept offer": cleared(null),
    "decline offer": kept("paddle"),
    "file downloaded": kept("paddle"),
    "enter access point editing": kept("paddle"),
    "next mode picked": set("hike"),
    "official aires loaded": kept("paddle"),
    "route requested": kept("paddle"),
    "route arrived": kept("paddle"),
  },
  (s) => s.nextMode,
  paddlePicked,
);

describe("the next leg's mode (#121)", () => {
  const pick = (session: PlannerSession, mode: "hike" | "paddle") =>
    plannerSession(session, { type: "nextModePicked", mode });

  it("starts with no pick: the last leg's mode, hike for a trip without legs", () => {
    expect(firstSession({ trip: emptyTrip() }).nextMode).toBeNull();
    expect(nextLegMode(firstSession({ trip: emptyTrip() }))).toBe("hike");
    const paddling = run(firstSession({ trip: through(A, B) }), { type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] });
    expect(nextLegMode(paddling)).toBe("paddle");
  });

  it("the pick wins over the last leg's mode", () => {
    expect(nextLegMode(pick(firstSession({ trip: through(A, B) }), "paddle"))).toBe("paddle");
  });

  it("add point draws the new leg in the picked mode", () => {
    const after = plannerSession(pick(firstSession({ trip: through(A, B) }), "paddle"), {
      type: "addPoint",
      at: C,
      accessPoints: [],
    });
    expect(after.trip.legs.map((leg) => leg.mode)).toEqual(["hike", "paddle"]);
    expect(nextLegMode(after)).toBe("paddle");
  });

  it("the first point carries the pick over to the second", () => {
    const first = plannerSession(pick(firstSession({ trip: emptyTrip() }), "paddle"), {
      type: "addPoint",
      at: A,
      accessPoints: [],
    });
    expect(first.nextMode).toBe("paddle");
    const second = plannerSession(first, { type: "addPoint", at: B, accessPoints: [] });
    expect(second.trip.legs.map((leg) => leg.mode)).toEqual(["paddle"]);
    expect(second.nextMode).toBeNull();
  });

  it("back to start draws the closing leg in the picked mode", () => {
    const after = plannerSession(pick(firstSession({ trip: through(A, B, C) }), "paddle"), { type: "backToStart" });
    expect(after.trip.legs.map((leg) => leg.mode)).toEqual(["hike", "hike", "paddle"]);
    expect(after.nextMode).toBeNull();
  });

  it("is cleared when the trip is replaced, at once or after the question", () => {
    const empty = pick(firstSession({ trip: emptyTrip() }), "paddle");
    expect(plannerSession(empty, { type: "fileOpened", trip: through(A, B) }).nextMode).toBeNull();
    const asked = run(paddlePicked(), { type: "newTrip" });
    expect(asked.nextMode).toBe("paddle");
    expect(plannerSession(asked, { type: "cancelReplace" }).nextMode).toBe("paddle");
    expect(plannerSession(asked, { type: "confirmReplace" }).nextMode).toBeNull();
  });

  it("can't be picked while the replace question is open", () => {
    const asked = run(paddlePicked(), { type: "newTrip" });
    expect(pick(asked, "hike")).toBe(asked);
  });
});

table(
  "stored save kept (the stored save is kept)",
  Object.fromEntries(actions.map(([name]) => [name, kept(true)])),
  (s) => s.keepStoredSave,
);

// The map fits the trip when this changes (#241): no edit, selection or route changes it.
table(
  "trip generation (no replace yet)",
  Object.fromEntries(actions.map(([name]) => [name, kept(0)])),
  (s) => s.tripGeneration,
);

describe("trip generation (#241)", () => {
  it("starts at 0", () => {
    expect(firstSession({ trip: through(A, B) }).tripGeneration).toBe(0);
  });

  it("goes up by one each time the trip is replaced, at once or after the question", () => {
    const empty = firstSession({ trip: emptyTrip() });
    const opened = plannerSession(empty, { type: "fileOpened", trip: through(A, B) });
    expect(opened.tripGeneration).toBe(1);
    const asked = plannerSession(opened, { type: "fileOpened", trip: through(C) });
    expect(asked.tripGeneration).toBe(1);
    expect(plannerSession(asked, { type: "cancelReplace" }).tripGeneration).toBe(1);
    expect(plannerSession(asked, { type: "confirmReplace" }).tripGeneration).toBe(2);
    expect(run(opened, { type: "newTrip" }, { type: "confirmReplace" }).tripGeneration).toBe(2);
  });
});

describe("rule table: replacing the trip", () => {
  const replacing = [
    ["new trip", { type: "newTrip" }, emptyTrip(), "newTrip"],
    ["file opened", { type: "fileOpened", trip: through(C) }, through(C), "openFile"],
  ] as const;

  for (const [name, action, next, question] of replacing) {
    it(`${name} on a trip with points asks the question; only the file error is cleared`, () => {
      const before = busy();
      const after = plannerSession(before, action);
      expect(after).toEqual({ ...before, pendingTrip: next, question, fileError: null });
    });

    it(`${name} on a trip without points replaces it at once`, () => {
      const empty = { ...busy(), trip: emptyTrip() };
      expect(plannerSession(empty, action)).toMatchObject({
        trip: next,
        selectedPoint: null,
        selectedLeg: null,
        offers: [],
        fileError: null,
        keepStoredSave: false,
        pendingTrip: null,
      });
    });

    it(`confirming the ${name} question replaces the trip: selection, offers, error and kept flag cleared`, () => {
      expect(run(busy(), action, { type: "confirmReplace" })).toMatchObject({
        trip: next,
        selectedPoint: null,
        selectedLeg: null,
        offers: [],
        fileError: null,
        keepStoredSave: false,
        pendingTrip: null,
      });
    });
  }

  it("file rejected sets the file error and changes nothing else", () => {
    const before = { ...busy(), fileError: null };
    expect(plannerSession(before, { type: "fileRejected", reason: "unknown-version" })).toEqual({
      ...before,
      fileError: "unknown-version",
    });
  });
});

describe("snap offers from set leg mode", () => {
  it("are worked out from the trip the change produced", () => {
    const session = firstSession({ trip: through(A, B) });
    const after = plannerSession(session, { type: "setLegMode", index: 0, mode: "paddle", accessPoints: access });
    expect(after.offers.map((o) => [o.change, targetId(o)])).toEqual([[{ kind: "put-in", point: 0 }, "near"]]);
  });

  it("are the right ones after a route arrived first", () => {
    const session = firstSession({ trip: through(A, B, C) });
    const request = requestOfLeg(session.trip, 0);
    const arrived = plannerSession(session, { type: "routeArrived", request, route: routed });
    const after = plannerSession(arrived, { type: "setLegMode", index: 0, mode: "paddle", accessPoints: access });
    expect(after.offers.map((o) => o.change)).toEqual([{ kind: "put-in", point: 0 }]);
  });

  it("replace the earlier offers", () => {
    const after = plannerSession(busy(), { type: "setLegMode", index: 1, mode: "paddle", accessPoints: [] });
    expect(after.offers).toEqual([]);
  });
});

describe("snap offers from add point", () => {
  // "b" is a slipway about 55 m from B.
  const nearB: LatLng = { lat: 50.3632, lng: 5.4563 };
  const atB = slipway("b", nearB);

  const paddlePick: PlannerAction = { type: "nextModePicked", mode: "paddle" };

  it("offer to snap the put-in a new paddle leg after a hike leg makes", () => {
    const session = run(firstSession({ trip: through(A, B) }), paddlePick);
    const after = plannerSession(session, { type: "addPoint", at: C, accessPoints: atB });
    expect(after.offers.map((o) => [o.change, targetId(o)])).toEqual([[{ kind: "put-in", point: 1 }, "b"]]);
  });

  it("offer to snap the paddle leg's new end, the trip's take-out", () => {
    const paddling = run(firstSession({ trip: through(A) }), paddlePick, { type: "addPoint", at: nearB, accessPoints: [] });
    const after = plannerSession(paddling, { type: "addPoint", at: B, accessPoints: atB });
    expect(after.offers.map((o) => o.change)).toEqual([{ kind: "take-out", point: 2 }]);
  });

  it("replace the earlier offers; a point that makes no put-in or take-out offers nothing", () => {
    const after = plannerSession(busy(), { type: "addPoint", at: nearA, accessPoints: access });
    expect(after.offers).toEqual([]);
  });
});

describe("snap offers from move point", () => {
  // A paddle leg A -> B, then a hike leg to C: A is the put-in, B the take-out. "b" is a slipway about 55 m from B.
  const nearB: LatLng = { lat: 50.3632, lng: 5.4563 };
  const atB = slipway("b", nearB);
  const besideB: LatLng = { lat: 50.3632, lng: 5.4565 }; // about 14 m from "b"
  const besideA: LatLng = { lat: 50.3532, lng: 5.4565 }; // about 14 m from the official aire
  const paddling = () =>
    run(
      firstSession({ trip: through(A, B, C) }),
      { type: "officialAiresLoaded", aires: [officialAire] },
      { type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] },
    );
  const moveTo = (index: number, to: LatLng): PlannerAction => ({ type: "movePoint", index, to, accessPoints: atB });

  it("offer to snap a take-out moved near one of your access points", () => {
    const after = plannerSession(paddling(), moveTo(1, besideB));
    expect(after.offers.map((o) => [o.change, targetId(o)])).toEqual([[{ kind: "take-out", point: 1 }, "b"]]);
  });

  it("offer to snap a put-in moved near an official aire", () => {
    const after = plannerSession(paddling(), moveTo(0, besideA));
    expect(after.offers.map((o) => [o.change, o.target.kind])).toEqual([[{ kind: "put-in", point: 0 }, "official-aire"]]);
  });

  it("replace the earlier offers; a moved point that is no put-in or take-out offers nothing", () => {
    const after = run(paddling(), moveTo(1, besideB), moveTo(2, besideB));
    expect(after.offers).toEqual([]);
  });

  it("accepting it moves the point onto the access point", () => {
    const after = plannerSession(paddling(), moveTo(1, besideB));
    expect(plannerSession(after, { type: "acceptOffer", offer: after.offers[0] }).trip.points[1]).toEqual(nearB);
  });
});

describe("official aires loaded", () => {
  const paddleLeg: PlannerAction = { type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] };
  const aires: PlannerAction = { type: "officialAiresLoaded", aires: [officialAire] };

  it("start empty and are offered to the edits after they load", () => {
    const first = firstSession({ trip: through(A, B) });
    expect(first.officialAires).toEqual([]);
    const after = run(first, aires, paddleLeg);
    expect(after.officialAires).toEqual([officialAire]);
    expect(after.offers.map((o) => o.target)).toEqual([{ kind: "official-aire", aire: officialAire }]);
  });

  it("an edit before they load gets no offer to an aire, and none is added when they load", () => {
    const before = run(firstSession({ trip: through(A, B) }), paddleLeg);
    expect(before.offers).toEqual([]);
    expect(plannerSession(before, aires).offers).toEqual([]);
  });

  it("are stored while the replace question is open and while editing access points", () => {
    const asked = run(firstSession({ trip: through(A, B) }), { type: "newTrip" });
    expect(plannerSession(asked, aires).officialAires).toEqual([officialAire]);
    const editing = run(firstSession({ trip: through(A, B) }), {
      type: "enterAccessPointEditing",
      returnTo: { tab: "sections", sheet: "peek" },
    });
    expect(plannerSession(editing, aires).officialAires).toEqual([officialAire]);
  });

  it("outlast replacing the trip", () => {
    const loaded = run(firstSession({ trip: emptyTrip() }), aires, { type: "fileOpened", trip: through(A, B) });
    expect(loaded.officialAires).toEqual([officialAire]);
  });
});

describe("snap offers from access points changed", () => {
  it("drops the offer to a deleted access point and keeps the others", () => {
    const both = [...slipway("near", nearA), ...slipway("c", { lat: 50.3632, lng: 5.4563 })]; // "c" is near B
    const withOffers = plannerSession(firstSession({ trip: through(A, B, C) }), {
      type: "setLegMode",
      index: 0,
      mode: "paddle",
      accessPoints: both,
    });
    expect(withOffers.offers.map((o) => targetId(o)).sort()).toEqual(["c", "near"]);
    const after = plannerSession(withOffers, { type: "accessPointsChanged", accessPoints: both.slice(1) });
    expect(after.offers.map((o) => targetId(o))).toEqual(["c"]);
  });

  it("makes the offer to a moved access point follow it; accepting moves the point there", () => {
    const offered = plannerSession(firstSession({ trip: through(A, B) }), {
      type: "setLegMode",
      index: 0,
      mode: "paddle",
      accessPoints: access,
    });
    const to: LatLng = { lat: 50.3537, lng: 5.4563 }; // about 111 m from A
    const moved = plannerSession(offered, {
      type: "accessPointsChanged",
      accessPoints: updateAccessPoint(access, "near", { position: to }, T),
    });
    expect(moved.offers).toHaveLength(1);
    expect(accessPointOf(moved.offers[0]).position).toEqual(to);
    expect(moved.offers[0].distanceM).toBeGreaterThan(100);
    expect(moved.offers[0].distanceM).toBeLessThan(120);
    expect(plannerSession(moved, { type: "acceptOffer", offer: moved.offers[0] }).trip.points[0]).toEqual(to);
  });

  it("leaves an offer to an official aire alone; accepting moves the point onto it", () => {
    const offered = run(
      firstSession({ trip: through(A, B) }),
      { type: "officialAiresLoaded", aires: [officialAire] },
      { type: "setLegMode", index: 0, mode: "paddle", accessPoints: [] },
    );
    expect(offered.offers.map((o) => o.target)).toEqual([{ kind: "official-aire", aire: officialAire }]);
    const after = plannerSession(offered, { type: "accessPointsChanged", accessPoints: access });
    expect(after.offers).toEqual(offered.offers);
    expect(plannerSession(after, { type: "acceptOffer", offer: after.offers[0] }).trip.points[0]).toEqual(nearA);
  });

  it("keeps the trip and the selected point", () => {
    const before = busy();
    const after = plannerSession(before, { type: "accessPointsChanged", accessPoints: [] });
    expect(after.offers).toEqual([]);
    expect(after.trip).toBe(before.trip);
    expect(after.selectedPoint).toBe(1);
  });
});

describe("while the replace question is open", () => {
  const open = () => plannerSession(busy(), { type: "newTrip" });

  it("ignores every action except confirm, cancel, the routing actions and the official aires loading", () => {
    const session = open();
    for (const [name, make] of actions) {
      if (name.startsWith("route") || name === "official aires loaded") continue;
      expect(plannerSession(session, build(make, session)), name).toBe(session);
    }
    expect(plannerSession(session, { type: "newTrip" })).toBe(session);
    expect(plannerSession(session, { type: "fileOpened", trip: through(C) })).toBe(session);
    expect(plannerSession(session, { type: "fileRejected", reason: "invalid" })).toBe(session);
  });

  it("stores a route that arrives meanwhile on the current trip", () => {
    const session = open();
    const request = requestOfLeg(session.trip, 1);
    const after = plannerSession(session, { type: "routeArrived", request, route: routed });
    expect(after.trip.legs[1].route).toEqual(routed);
    expect(after.pendingTrip).toEqual(emptyTrip());
  });

  it("cancel leaves everything but the question as it was", () => {
    const before = busy();
    const after = run(before, { type: "newTrip" }, { type: "cancelReplace" });
    expect(after).toEqual({ ...before, fileError: null });
  });

  it("cancel remembers which question was asked, for the closing dialog", () => {
    const after = run(busy(), { type: "fileOpened", trip: through(C) }, { type: "cancelReplace" });
    expect(after.question).toBe("openFile");
  });
});

describe("route answers", () => {
  it("a stale answer is ignored", () => {
    const session = firstSession({ trip: through(A, B) });
    const request = requestOfLeg(session.trip, 0);
    const moved = run(
      session,
      { type: "movePoint", index: 1, to: C, accessPoints: [] },
      { type: "routeArrived", request, route: routed },
    );
    expect(moved.trip.legs[0].route).toBeUndefined();
  });

  it("an answer for a leg that undo brought back is stored", () => {
    const session = firstSession({ trip: through(A, B) });
    const request = requestOfLeg(session.trip, 0);
    const back = run(
      session,
      { type: "movePoint", index: 1, to: C, accessPoints: [] },
      { type: "undo" },
      { type: "routeArrived", request, route: routed },
    );
    expect(back.trip.legs[0].route).toEqual(routed);
  });

  it("route requested marks the waiting leg pending", () => {
    const session = firstSession({ trip: through(A, B) });
    const after = plannerSession(session, { type: "routeRequested", request: requestOfLeg(session.trip, 0) });
    expect(after.trip.legs[0].route).toEqual({ status: "pending" });
  });
});

describe("stored save kept", () => {
  it("starts from what loading the stored trip returned", () => {
    expect(firstSession({ trip: emptyTrip(), unknownVersion: true }).keepStoredSave).toBe(true);
    expect(firstSession({ trip: emptyTrip(), unknownVersion: false }).keepStoredSave).toBe(false);
  });

  it("is cleared only by a replace", () => {
    let session = firstSession({ trip: through(A, B), unknownVersion: true });
    const others: PlannerAction[] = [
      { type: "addPoint", at: C, accessPoints: [] },
      { type: "undo" },
      { type: "rename", name: "x" },
      { type: "fileRejected", reason: "invalid" },
      { type: "fileDownloaded" },
      { type: "newTrip" },
      { type: "cancelReplace" },
    ];
    for (const action of others) {
      session = plannerSession(session, action);
      expect(session.keepStoredSave, action.type).toBe(true);
    }
    expect(run(session, { type: "newTrip" }, { type: "confirmReplace" }).keepStoredSave).toBe(false);
  });
});

describe("actions that can't apply", () => {
  it("delete or toggle camp with no selected point return the same session", () => {
    const s = firstSession({ trip: through(A, B) });
    expect(plannerSession(s, { type: "deleteSelectedPoint" })).toBe(s);
    expect(plannerSession(s, { type: "toggleCampOnSelectedPoint" })).toBe(s);
  });

  it("accepting an offer that is no longer listed returns the same session", () => {
    const offer = busy().offers[0];
    const declined = plannerSession(busy(), { type: "declineOffer", offer });
    expect(plannerSession(declined, { type: "acceptOffer", offer })).toBe(declined);
  });

  it("confirm or cancel with no question open return the same session", () => {
    const s = busy();
    expect(plannerSession(s, { type: "confirmReplace" })).toBe(s);
    expect(plannerSession(s, { type: "cancelReplace" })).toBe(s);
  });
});

describe("accepting an offer", () => {
  it("moves the point onto the access point as one undoable edit", () => {
    const session = busy();
    const after = plannerSession(session, { type: "acceptOffer", offer: session.offers[0] });
    expect(after.trip.points[0]).toEqual(nearA);
    expect(plannerSession(after, { type: "undo" }).trip.points[0]).toEqual(A);
  });
});
