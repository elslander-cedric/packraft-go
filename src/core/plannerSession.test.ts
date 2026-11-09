// Seam: the planner session function (ADR 0025, spec #94). Tests send actions and
// check the session that comes out. The rule tables follow ADR 0025: one table per
// piece of state, one row per action saying cleared / kept / set.
import { describe, expect, it } from "vitest";
import { addAccessPoint, updateAccessPoint, type AccessPoint, type AccessPoints } from "./accessPoints";
import type { OfficialAire } from "./officialAire";
import {
  editingAccessPoints,
  firstSession,
  nextLegMode,
  plannerSession,
  shownTab,
  type PlannerAction,
  type PlannerSession,
} from "./plannerSession";
import type { LegRoute } from "./router";
import type { RouteRequest } from "./routing";
import type { SnapOffer } from "./snap";
import { applyEdit, emptyTrip, type LatLng, type Trip } from "./trip";

const T = "2026-10-14T08:00:00.000Z";
const A: LatLng = { lat: 50.3527, lng: 5.4563 };
const B: LatLng = { lat: 50.3627, lng: 5.4563 };
const C: LatLng = { lat: 50.3727, lng: 5.4563 };
const nearA: LatLng = { lat: 50.3532, lng: 5.4563 }; // about 55 m from A
const D: LatLng = { lat: 50.44, lng: 5.6 }; // far from the trip
const E: LatLng = { lat: 50.45, lng: 5.6 }; // far from the trip
const F: LatLng = { lat: 50.5, lng: 5.7 }; // far from the trip
const T2 = "2026-10-15T09:00:00.000Z";

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
  const first = firstSession({ trip: through(A, B, C), unknownVersion: true, accessPoints: access });
  const withOffer = plannerSession(first, { type: "setLegMode", index: 0, mode: "paddle" });
  expect(withOffer.offers).toHaveLength(1);
  return { ...withOffer, selectedPoint: 1, fileError: "invalid" };
};

const editAccessPoints: PlannerAction = { type: "enterAccessPointEditing" };

type Make = PlannerAction | ((session: PlannerSession) => PlannerAction);
const build = (make: Make, session: PlannerSession) => (typeof make === "function" ? make(session) : make);

// Every action that applies to a busy session while no question is open.
const actions: [name: string, make: Make][] = [
  ["add point", { type: "addPoint", at: { lat: 50.4, lng: 5.5 } }],
  [
    "move point",
    { type: "movePoint", index: 0, to: { lat: 50.4, lng: 5.5 } },
  ],
  ["delete selected point", { type: "deleteSelectedPoint" }],
  ["back to start", { type: "backToStart" }],
  ["insert point", { type: "insertPoint", index: 0, near: { lat: 50.3577, lng: 5.4563 } }],
  ["set leg mode", { type: "setLegMode", index: 1, mode: "paddle" }],
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
  ["enter access point editing", { type: "enterAccessPointEditing" }],
  ["next mode picked", { type: "nextModePicked", mode: "hike" }],
  ["official aires loaded", { type: "officialAiresLoaded", aires: [officialAire] }],
  ["leave access point editing", { type: "leaveAccessPointEditing" }],
  ["map tapped", { type: "mapTapped", at: E, newId: "tapped", now: T2 }],
  ["draft placed", { type: "draftPlaced", at: E, newId: "placed", now: T2 }],
  ["draft moved", { type: "draftMoved", to: E, now: T2 }],
  ["draft saved", { type: "draftSaved", changes: { name: "Mine" }, now: T2 }],
  ["draft discarded", { type: "draftDiscarded" }],
  ["access point clicked", { type: "accessPointClicked", id: "near" }],
  ["access point moved", { type: "accessPointMoved", id: "near", to: E, now: T2 }],
  ["access point updated", { type: "accessPointUpdated", id: "near", changes: { name: "Bridge" }, now: T2 }],
  ["access point deleted", { type: "accessPointDeleted", id: "far" }],
  ["default name found", { type: "defaultNameFound", id: "draft", at: D, name: "Rue du Moulin" }],
  ["tab chosen", { type: "tabChosen", tab: "days" }],
  ["sheet moved", { type: "sheetMoved", stop: "full" }],
  ["panel toggled", { type: "panelToggled", open: true }],
  ["row tapped", { type: "rowTapped", row: { kind: "leg", index: 0 } }],
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
    "leave access point editing": kept(1),
    "map tapped": cleared(null), // only clears the selection
    "draft placed": kept(1),
    "draft moved": kept(1),
    "draft saved": kept(1),
    "draft discarded": kept(1),
    "access point clicked": kept(1),
    "access point moved": kept(1),
    "access point updated": kept(1),
    "access point deleted": kept(1),
    "default name found": kept(1),
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
    "tab chosen": kept(1),
    "sheet moved": kept(1),
    "panel toggled": kept(1),
    "row tapped": kept(1),
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
    "leave access point editing": kept(1),
    "map tapped": kept(1), // a deselect
    "draft placed": kept(1),
    "draft moved": kept(1),
    "draft saved": kept(1),
    "draft discarded": kept(1),
    "access point clicked": kept(1),
    "access point moved": kept(1),
    "access point updated": kept(1),
    "access point deleted": kept(1),
    "default name found": kept(1),
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
    "tab chosen": kept(1),
    "sheet moved": kept(1),
    "panel toggled": kept(1),
    "row tapped": kept(1),
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
    "leave access point editing": kept("invalid"),
    "map tapped": cleared(null), // a deselect
    "draft placed": kept("invalid"),
    "draft moved": kept("invalid"),
    "draft saved": kept("invalid"),
    "draft discarded": kept("invalid"),
    "access point clicked": kept("invalid"),
    "access point moved": kept("invalid"),
    "access point updated": kept("invalid"),
    "access point deleted": kept("invalid"),
    "default name found": kept("invalid"),
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
    "tab chosen": kept("invalid"),
    "sheet moved": kept("invalid"),
    "panel toggled": kept("invalid"),
    "row tapped": kept("invalid"),
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
    "leave access point editing": kept(1),
    "map tapped": cleared(null), // only clears the selection
    "draft placed": kept(1),
    "draft moved": kept(1),
    "draft saved": kept(1),
    "draft discarded": kept(1),
    "access point clicked": kept(1),
    "access point moved": kept(1),
    "access point updated": kept(1),
    "access point deleted": kept(1),
    "default name found": kept(1),
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
    "tab chosen": kept(1),
    "sheet moved": kept(1),
    "panel toggled": kept(1),
    "row tapped": kept(1), // a row tap doesn't select a leg on the map (#243)
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
    "leave access point editing": kept("paddle"),
    "map tapped": kept("paddle"), // a deselect
    "draft placed": kept("paddle"),
    "draft moved": kept("paddle"),
    "draft saved": kept("paddle"),
    "draft discarded": kept("paddle"),
    "access point clicked": kept("paddle"),
    "access point moved": kept("paddle"),
    "access point updated": kept("paddle"),
    "access point deleted": kept("paddle"),
    "default name found": kept("paddle"),
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
    "tab chosen": kept("paddle"),
    "sheet moved": kept("paddle"),
    "panel toggled": kept("paddle"),
    "row tapped": kept("paddle"),
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
    const paddling = run(firstSession({ trip: through(A, B) }), { type: "setLegMode", index: 0, mode: "paddle" });
    expect(nextLegMode(paddling)).toBe("paddle");
  });

  it("the pick wins over the last leg's mode", () => {
    expect(nextLegMode(pick(firstSession({ trip: through(A, B) }), "paddle"))).toBe("paddle");
  });

  it("add point draws the new leg in the picked mode", () => {
    const after = plannerSession(pick(firstSession({ trip: through(A, B) }), "paddle"), {
      type: "addPoint",
      at: C,
    });
    expect(after.trip.legs.map((leg) => leg.mode)).toEqual(["hike", "paddle"]);
    expect(nextLegMode(after)).toBe("paddle");
  });

  it("the first point carries the pick over to the second", () => {
    const first = plannerSession(pick(firstSession({ trip: emptyTrip() }), "paddle"), {
      type: "addPoint",
      at: A,
    });
    expect(first.nextMode).toBe("paddle");
    const second = plannerSession(first, { type: "addPoint", at: B });
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

// The row highlight (#243): a leg, section or day row marked in the panel, as an index. Edits and
// replaces clear it, so it never points at another row. This session has leg 1's row highlighted.
const rowHighlighted = (): PlannerSession =>
  plannerSession(busy(), { type: "rowTapped", row: { kind: "leg", index: 1 } });
const leg1 = { kind: "leg", index: 1 };

table(
  "row highlight (leg 1's row is highlighted)",
  {
    "add point": cleared(null),
    "move point": cleared(null),
    "delete selected point": cleared(null),
    "back to start": cleared(null),
    "insert point": cleared(null),
    "set leg mode": cleared(null), // the sections may change
    "toggle camp": cleared(null), // the days may change
    undo: cleared(null),
    rename: kept(leg1),
    "set start date": kept(leg1),
    "retry leg": kept(leg1),
    "point clicked": kept(leg1), // the map selection is apart from it
    "leg clicked": kept(leg1),
    deselect: kept(leg1),
    "map tapped": kept(leg1), // a deselect
    "accept offer": cleared(null),
    "decline offer": kept(leg1),
    "file downloaded": kept(leg1),
    "enter access point editing": kept(leg1),
    "leave access point editing": kept(leg1),
    "next mode picked": kept(leg1),
    "official aires loaded": kept(leg1),
    "draft placed": kept(leg1),
    "draft moved": kept(leg1),
    "draft saved": kept(leg1),
    "draft discarded": kept(leg1),
    "access point clicked": kept(leg1),
    "access point moved": kept(leg1),
    "access point updated": kept(leg1),
    "access point deleted": kept(leg1),
    "default name found": kept(leg1),
    "tab chosen": kept(leg1),
    "sheet moved": kept(leg1),
    "panel toggled": kept(leg1),
    "row tapped": set({ kind: "leg", index: 0 }),
    "route requested": kept(leg1),
    "route arrived": kept(leg1),
  },
  (s) => s.highlightedRow,
  rowHighlighted,
);

describe("row tapped (#243)", () => {
  const tap = (kind: "leg" | "section" | "day", index: number): PlannerAction => ({
    type: "rowTapped",
    row: { kind, index },
  });

  it("starts with no row highlighted", () => {
    expect(firstSession({ trip: through(A, B, C) }).highlightedRow).toBeNull();
  });

  it("highlights one row at a time, of any kind", () => {
    expect(run(rowHighlighted(), tap("section", 0)).highlightedRow).toEqual({ kind: "section", index: 0 });
    expect(run(rowHighlighted(), tap("day", 0)).highlightedRow).toEqual({ kind: "day", index: 0 });
  });

  it("on the highlighted leg or section keeps it; on the highlighted day clears it", () => {
    expect(run(rowHighlighted(), tap("leg", 1)).highlightedRow).toEqual(leg1);
    expect(run(busy(), tap("section", 0), tap("section", 0)).highlightedRow).toEqual({ kind: "section", index: 0 });
    expect(run(busy(), tap("day", 0), tap("day", 0)).highlightedRow).toBeNull();
  });

  it("doesn't select anything on the map or clear the file error", () => {
    const after = run({ ...busy(), selectedPoint: null }, tap("leg", 1));
    expect(after.selectedLeg).toBeNull();
    expect(after.selectedPoint).toBeNull();
    expect(after.fileError).toBe("invalid");
  });

  it("a map tap that adds a point clears it", () => {
    const highlighted = run({ ...busy(), selectedPoint: null }, tap("leg", 1));
    expect(run(highlighted, { type: "mapTapped", at: E, newId: "x", now: T2 }).highlightedRow).toBeNull();
  });
});

// The panel view (#243): the tab, the sheet's stop and, while editing, whether the side panel is open.
// This session is in normal mode on the Sections tab, with the sheet at half.
const atHalf = (): PlannerSession => plannerSession(busy(), { type: "sheetMoved", stop: "half" });
/** What the planner shows: the tab, the stop and the panel's open state (the stored setting in normal mode). */
const view = (s: PlannerSession) => ({
  tab: shownTab(s),
  stop: s.panel.sheetStop,
  open: editingAccessPoints(s) ? s.panel.openWhileEditing : "stored",
});
const sectionsHalf = { tab: "sections", stop: "half", open: "stored" };

table(
  "panel view (Sections, sheet at half)",
  {
    ...Object.fromEntries(actions.map(([name]) => [name, kept(sectionsHalf)])),
    "enter access point editing": set({ tab: "accessPoints", stop: "half", open: true }),
    "tab chosen": set({ ...sectionsHalf, tab: "days" }),
    "sheet moved": set({ ...sectionsHalf, stop: "full" }),
    "panel toggled": kept(sectionsHalf), // in normal mode the panel's open state is a stored setting
  },
  view,
  atHalf,
);

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
        highlightedRow: null,
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
        highlightedRow: null,
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
    const session = firstSession({ trip: through(A, B), accessPoints: access });
    const after = plannerSession(session, { type: "setLegMode", index: 0, mode: "paddle" });
    expect(after.offers.map((o) => [o.change, targetId(o)])).toEqual([[{ kind: "put-in", point: 0 }, "near"]]);
  });

  it("are the right ones after a route arrived first", () => {
    const session = firstSession({ trip: through(A, B, C), accessPoints: access });
    const request = requestOfLeg(session.trip, 0);
    const arrived = plannerSession(session, { type: "routeArrived", request, route: routed });
    const after = plannerSession(arrived, { type: "setLegMode", index: 0, mode: "paddle" });
    expect(after.offers.map((o) => o.change)).toEqual([{ kind: "put-in", point: 0 }]);
  });

  it("replace the earlier offers", () => {
    const after = plannerSession(busy(), { type: "setLegMode", index: 1, mode: "paddle" });
    expect(after.offers).toEqual([]);
  });
});

describe("snap offers from add point", () => {
  // "b" is a slipway about 55 m from B.
  const nearB: LatLng = { lat: 50.3632, lng: 5.4563 };
  const atB = slipway("b", nearB);

  const paddlePick: PlannerAction = { type: "nextModePicked", mode: "paddle" };

  it("offer to snap the put-in a new paddle leg after a hike leg makes", () => {
    const session = run(firstSession({ trip: through(A, B), accessPoints: atB }), paddlePick);
    const after = plannerSession(session, { type: "addPoint", at: C });
    expect(after.offers.map((o) => [o.change, targetId(o)])).toEqual([[{ kind: "put-in", point: 1 }, "b"]]);
  });

  it("offer to snap the paddle leg's new end, the trip's take-out", () => {
    const paddling = run(firstSession({ trip: through(A) }), paddlePick, { type: "addPoint", at: nearB });
    const after = plannerSession({ ...paddling, accessPoints: atB }, { type: "addPoint", at: B });
    expect(after.offers.map((o) => o.change)).toEqual([{ kind: "take-out", point: 2 }]);
  });

  it("replace the earlier offers; a point that makes no put-in or take-out offers nothing", () => {
    const after = plannerSession(busy(), { type: "addPoint", at: nearA });
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
      firstSession({ trip: through(A, B, C), accessPoints: atB }),
      { type: "officialAiresLoaded", aires: [officialAire] },
      { type: "setLegMode", index: 0, mode: "paddle" },
    );
  const moveTo = (index: number, to: LatLng): PlannerAction => ({ type: "movePoint", index, to });

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
  const paddleLeg: PlannerAction = { type: "setLegMode", index: 0, mode: "paddle" };
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
    });
    expect(plannerSession(editing, aires).officialAires).toEqual([officialAire]);
  });

  it("outlast replacing the trip", () => {
    const loaded = run(firstSession({ trip: emptyTrip() }), aires, { type: "fileOpened", trip: through(A, B) });
    expect(loaded.officialAires).toEqual([officialAire]);
  });
});

// Offers follow your access points (#97): the edits while editing change them, and the offers wait for Done.
describe("snap offers follow your access points", () => {
  const nearC = slipway("c", { lat: 50.3632, lng: 5.4563 }); // near B
  /** Editing, with offers to "near" (A's put-in) and "c" (B's take-out). */
  const offered = (aires: readonly OfficialAire[] = []): PlannerSession =>
    run(
      firstSession({ trip: through(A, B, C), accessPoints: [...access, ...nearC] }),
      { type: "officialAiresLoaded", aires },
      { type: "setLegMode", index: 0, mode: "paddle" },
      editAccessPoints,
    );

  it("drops the offer to a deleted access point and keeps the others", () => {
    const before = offered();
    expect(before.offers.map(targetId).sort()).toEqual(["c", "near"]);
    const after = plannerSession(before, { type: "accessPointDeleted", id: "near" });
    expect(after.offers.map(targetId)).toEqual(["c"]);
  });

  it("makes the offer to a moved access point follow it; accepting after Done moves the point there", () => {
    const to: LatLng = { lat: 50.3537, lng: 5.4563 }; // about 111 m from A
    const moved = plannerSession(offered(), { type: "accessPointMoved", id: "near", to, now: T2 });
    const offer = moved.offers.find((o) => targetId(o) === "near")!;
    expect(accessPointOf(offer).position).toEqual(to);
    expect(offer.distanceM).toBeGreaterThan(100);
    expect(offer.distanceM).toBeLessThan(120);
    const done = plannerSession(moved, { type: "leaveAccessPointEditing" });
    expect(plannerSession(done, { type: "acceptOffer", offer: done.offers[0] }).trip.points[0]).toEqual(to);
  });

  it("makes the offer to an updated or newly named access point show it as it is now", () => {
    const renamed = plannerSession(offered(), { type: "accessPointUpdated", id: "near", changes: { name: "Bridge" }, now: T2 });
    expect(accessPointOf(renamed.offers.find((o) => targetId(o) === "near")!).name).toBe("Bridge");
    const named = plannerSession(offered(), { type: "defaultNameFound", id: "c", at: nearC[0].position, name: "Rue X" });
    expect(accessPointOf(named.offers.find((o) => targetId(o) === "c")!).name).toBe("Rue X");
  });

  it("leaves an offer to an official aire alone", () => {
    const before = run(
      firstSession({ trip: through(A, B) }),
      { type: "officialAiresLoaded", aires: [officialAire] },
      { type: "setLegMode", index: 0, mode: "paddle" },
      editAccessPoints,
      { type: "mapTapped", at: nearA, newId: "new", now: T2 },
      { type: "draftSaved", changes: { kind: "slipway" }, now: T2 },
    );
    expect(before.offers.map((o) => o.target)).toEqual([{ kind: "official-aire", aire: officialAire }]);
  });

  it("keep the trip", () => {
    const before = offered();
    const after = plannerSession(before, { type: "accessPointDeleted", id: "c" });
    expect(after.trip).toBe(before.trip);
  });
});

// Access point editing (ADR 0036, #242): your access points, the new point being placed (the draft)
// and the selected access point. This session is editing, with "near" and "far" stored, the draft
// placed at D and "far" selected; one snap offer (to "near") waits for Done.
const far = slipway("far", F);
const editingBusy = (): PlannerSession =>
  run(
    { ...busy(), selectedPoint: null, accessPoints: [...access, ...far] },
    editAccessPoints,
    { type: "mapTapped", at: D, newId: "draft", now: T },
    { type: "accessPointClicked", id: "far" },
  );

/** What the tables read of an access point: enough to see each action's change. */
const seen = (point: AccessPoint) => ({ id: point.id, at: point.position, name: point.name });

// While editing, the trip's actions are frozen (#227) and the others leave these pieces alone.
const untouchedRows = (value: unknown): Record<string, Outcome> =>
  Object.fromEntries(
    [
      "add point",
      "move point",
      "delete selected point",
      "back to start",
      "insert point",
      "set leg mode",
      "toggle camp",
      "undo",
      "point clicked",
      "leg clicked",
      "deselect",
      "accept offer",
      "decline offer",
      "rename",
      "set start date",
      "retry leg",
      "file downloaded",
      "enter access point editing", // already editing
      "next mode picked",
      "tab chosen",
      "sheet moved",
      "panel toggled",
      "row tapped",
      "official aires loaded",
      "route requested",
      "route arrived",
    ].map((name) => [name, kept(value)]),
  );

const draftAtD = { id: "draft", at: D, name: "" };
table(
  "the draft (placed at D while editing)",
  {
    ...untouchedRows(draftAtD),
    "map tapped": set({ ...draftAtD, at: E }), // moved, not a second draft
    "draft placed": set({ ...draftAtD, at: E }),
    "draft moved": set({ ...draftAtD, at: E }),
    "draft saved": cleared(null), // stored
    "draft discarded": cleared(null),
    "access point clicked": kept(draftAtD),
    "access point moved": kept(draftAtD),
    "access point updated": kept(draftAtD),
    "access point deleted": kept(draftAtD),
    "default name found": set({ ...draftAtD, name: "Rue du Moulin" }),
    "leave access point editing": cleared(null), // dropped
  },
  (s) => s.draft && seen(s.draft),
  editingBusy,
);

table(
  "the selected access point (far is selected while editing)",
  {
    ...untouchedRows("far"),
    "map tapped": cleared(null),
    "draft placed": cleared(null),
    "draft moved": cleared(null),
    "draft saved": set("draft"), // the stored draft
    "draft discarded": kept("far"),
    "access point clicked": set("near"),
    "access point moved": kept("far"),
    "access point updated": kept("far"),
    "access point deleted": cleared(null), // far itself
    "default name found": kept("far"),
    "leave access point editing": cleared(null),
  },
  (s) => s.selectedAccessPoint,
  editingBusy,
);

const stored = [
  { id: "near", at: nearA, name: "" },
  { id: "far", at: F, name: "" },
];
table(
  "your access points (near and far while editing)",
  {
    ...untouchedRows(stored),
    "map tapped": kept(stored),
    "draft placed": kept(stored),
    "draft moved": kept(stored),
    "draft saved": set([...stored, { id: "draft", at: D, name: "Mine" }]),
    "draft discarded": kept(stored),
    "access point clicked": kept(stored),
    "access point moved": set([{ id: "near", at: E, name: "" }, stored[1]]),
    "access point updated": set([{ id: "near", at: nearA, name: "Bridge" }, stored[1]]),
    "access point deleted": set([stored[0]]),
    "default name found": kept(stored), // the draft's
    "leave access point editing": kept(stored),
  },
  (s) => s.accessPoints.map(seen),
  editingBusy,
);

// The panel view while editing: entered from Days with the sheet at half, then the sheet moved to the
// peek and the panel closed. Leaving restores the tab and the stop; the panel shows its stored setting.
const editingView = (): PlannerSession =>
  run(
    plannerSession(atHalf(), { type: "tabChosen", tab: "days" }),
    editAccessPoints,
    { type: "sheetMoved", stop: "peek" },
    { type: "panelToggled", open: false },
  );
const editingPeekClosed = { tab: "accessPoints", stop: "peek", open: false };
table(
  "panel view while editing (from Days at half; now at the peek, panel closed)",
  {
    ...Object.fromEntries(actions.map(([name]) => [name, kept(editingPeekClosed)])),
    "leave access point editing": set({ tab: "days", stop: "half", open: "stored" }),
    "tab chosen": kept(editingPeekClosed), // editing has only the Access points tab
    "sheet moved": set({ ...editingPeekClosed, stop: "full" }),
    "panel toggled": set({ ...editingPeekClosed, open: true }),
  },
  view,
  editingView,
);

describe("the panel view and access point editing (#243, ADR 0036)", () => {
  it("starts on the Sections tab with the sheet at the peek", () => {
    expect(view(firstSession({ trip: emptyTrip() }))).toEqual({ tab: "sections", stop: "peek", open: "stored" });
  });

  it("each visit opens the panel again", () => {
    const again = run(editingView(), { type: "leaveAccessPointEditing" }, editAccessPoints);
    expect(view(again)).toEqual({ tab: "accessPoints", stop: "half", open: true });
  });

  it("a tab chosen in normal mode is the one leaving brings back", () => {
    const left = run(atHalf(), editAccessPoints, { type: "leaveAccessPointEditing" }, { type: "tabChosen", tab: "days" });
    expect(shownTab(left)).toBe("days");
  });
});

describe("map tapped (#120, #230, #227)", () => {
  const tapAt = (at: LatLng): PlannerAction => ({ type: "mapTapped", at, newId: "new", now: T2 });

  it("while editing access points places the draft at the tap, with the given id and time; the trip is frozen", () => {
    const before = run(firstSession({ trip: through(A, B) }), editAccessPoints);
    const after = plannerSession(before, tapAt(E));
    expect(after.draft).toMatchObject({ id: "new", position: E, createdAt: T2, nameSource: "to-look-up" });
    expect(after.trip).toBe(before.trip);
    expect(after.accessPoints).toBe(before.accessPoints);
  });

  it("while editing access points moves the draft there when there is one", () => {
    const before = editingBusy();
    const after = plannerSession(before, tapAt(E));
    expect(after.draft).toMatchObject({ id: "draft", position: E, createdAt: T, updatedAt: T2 });
    expect(after.trip).toBe(before.trip);
  });

  it("with a point or a leg selected only clears the selection", () => {
    const point = { ...firstSession({ trip: through(A, B) }), selectedPoint: 1 };
    const leg = { ...firstSession({ trip: through(A, B) }), selectedLeg: 0 };
    for (const before of [point, leg]) {
      const after = plannerSession(before, tapAt(E));
      expect(after).toMatchObject({ selectedPoint: null, selectedLeg: null, draft: null });
      expect(after.trip).toBe(before.trip);
    }
  });

  it("with nothing selected adds a point with the next leg's mode, offering your access points", () => {
    const nearB: LatLng = { lat: 50.3632, lng: 5.4563 }; // a slipway about 55 m from B
    const before = run(firstSession({ trip: through(A, B), accessPoints: slipway("b", nearB) }), {
      type: "nextModePicked",
      mode: "paddle",
    });
    const after = plannerSession(before, tapAt(C));
    expect(after.trip.points).toEqual([A, B, C]);
    expect(after.trip.legs.map((leg) => leg.mode)).toEqual(["hike", "paddle"]);
    expect(after.offers.map(targetId)).toEqual(["b"]);
    expect(after.draft).toBeNull();
  });
});

describe("access point editing actions (#242)", () => {
  const normal = (): PlannerSession => firstSession({ trip: through(A, B), accessPoints: [...access, ...far] });
  const editActions: PlannerAction[] = [
    { type: "draftPlaced", at: E, newId: "placed", now: T2 },
    { type: "draftMoved", to: E, now: T2 },
    { type: "draftSaved", changes: { name: "Mine" }, now: T2 },
    { type: "draftDiscarded" },
    { type: "accessPointClicked", id: "near" },
    { type: "accessPointMoved", id: "near", to: E, now: T2 },
    { type: "accessPointUpdated", id: "near", changes: { name: "Bridge" }, now: T2 },
    { type: "accessPointDeleted", id: "far" },
  ];

  it("apply only while editing access points", () => {
    const before = normal();
    for (const action of editActions) expect(plannerSession(before, action), action.type).toBe(before);
  });

  it("start with your loaded access points, no draft and none selected", () => {
    expect(normal()).toMatchObject({ accessPoints: [...access, ...far], draft: null, selectedAccessPoint: null });
    expect(firstSession({ trip: emptyTrip() }).accessPoints).toEqual([]);
  });

  it("the mark button places the draft at your position, or moves it there", () => {
    const placed = run(firstSession({ trip: emptyTrip() }), editAccessPoints, {
      type: "draftPlaced",
      at: D,
      newId: "gps",
      now: T,
    });
    expect(placed.draft).toMatchObject({ id: "gps", position: D });
    const moved = plannerSession(placed, { type: "draftPlaced", at: E, newId: "other", now: T2 });
    expect(moved.draft).toMatchObject({ id: "gps", position: E });
  });

  it("moving or saving with no draft changes nothing", () => {
    const before = run(firstSession({ trip: emptyTrip() }), editAccessPoints);
    expect(plannerSession(before, { type: "draftMoved", to: E, now: T2 })).toBe(before);
    expect(plannerSession(before, { type: "draftSaved", changes: {}, now: T2 })).toBe(before);
  });

  it("draft saved stores it with the changes at the given time, after your other points", () => {
    const after = plannerSession(editingBusy(), {
      type: "draftSaved",
      changes: { name: "Mine", kind: "jetty" },
      now: T2,
    });
    expect(after.accessPoints.at(-1)).toMatchObject({
      id: "draft",
      name: "Mine",
      nameSource: "typed",
      kind: "jetty",
      createdAt: T,
      updatedAt: T2,
    });
  });

  it("an edit of an access point stamps it with the given time", () => {
    const after = plannerSession(editingBusy(), {
      type: "accessPointUpdated",
      id: "near",
      changes: { note: "steep" },
      now: T2,
    });
    expect(after.accessPoints[0]).toMatchObject({ note: "steep", updatedAt: T2 });
  });

  it("deleting another access point keeps the selection", () => {
    expect(plannerSession(editingBusy(), { type: "accessPointDeleted", id: "near" }).selectedAccessPoint).toBe("far");
  });

  it("entering access point editing clears the selected access point", () => {
    const left = { ...normal(), selectedAccessPoint: "near" };
    expect(plannerSession(left, editAccessPoints).selectedAccessPoint).toBeNull();
  });
});

describe("default name found (ADR 0027)", () => {
  const unnamed = (): PlannerSession => firstSession({ trip: emptyTrip(), accessPoints: [...access, ...far] });
  const found: PlannerAction = { type: "defaultNameFound", id: "far", at: F, name: "Rue X" };

  it("names a stored point still waiting at that position, keeping its updated time", () => {
    const after = plannerSession(unnamed(), found);
    expect(after.accessPoints[1]).toMatchObject({ name: "Rue X", nameSource: "default", updatedAt: T });
  });

  it("names the draft", () => {
    const after = plannerSession(editingBusy(), { type: "defaultNameFound", id: "draft", at: D, name: "Rue Y" });
    expect(after.draft).toMatchObject({ name: "Rue Y", nameSource: "default" });
  });

  it("is ignored for a point moved since, or named by you", () => {
    const moved = plannerSession(editingBusy(), { type: "accessPointMoved", id: "far", to: E, now: T2 });
    expect(plannerSession(moved, found)).toBe(moved);
    const named = plannerSession(editingBusy(), {
      type: "accessPointUpdated",
      id: "far",
      changes: { name: "Mine" },
      now: T2,
    });
    expect(plannerSession(named, found)).toBe(named);
  });

  it("applies while the replace question is open", () => {
    const asked = plannerSession({ ...unnamed(), trip: through(A, B) }, { type: "newTrip" });
    expect(asked.pendingTrip).not.toBeNull();
    expect(plannerSession(asked, found).accessPoints[1].name).toBe("Rue X");
  });
});

describe("while the replace question is open", () => {
  const open = () => plannerSession(busy(), { type: "newTrip" });

  it("ignores every action except confirm, cancel, the routing actions and the data arriving", () => {
    const session = open();
    for (const [name, make] of actions) {
      if (name.startsWith("route") || name === "official aires loaded" || name === "default name found") continue;
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
      { type: "movePoint", index: 1, to: C },
      { type: "routeArrived", request, route: routed },
    );
    expect(moved.trip.legs[0].route).toBeUndefined();
  });

  it("an answer for a leg that undo brought back is stored", () => {
    const session = firstSession({ trip: through(A, B) });
    const request = requestOfLeg(session.trip, 0);
    const back = run(
      session,
      { type: "movePoint", index: 1, to: C },
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
      { type: "addPoint", at: C },
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
