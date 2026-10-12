// Trip start date and save format reset (#52, ADR 0011 amendment, ADR 0022).
import { describe, expect, it } from "vitest";
import { parseTrip, restoreStoredTrip, serialiseTrip } from "./saveFile";
import { summarise } from "./summarise";
import { applyEdit, emptyTrip, setStartDate, type Trip } from "./trip";

const twoDays: Trip = {
  name: "Ourthe weekend",
  points: [
    { lat: 50.3, lng: 5.6 },
    { lat: 50.31, lng: 5.61 },
    { lat: 50.32, lng: 5.62 },
  ],
  legs: [{ mode: "hike" }, { mode: "paddle" }],
  camps: [1],
};

const dated: Trip = { ...twoDays, startDate: "2026-10-31" };

describe("start date", () => {
  it("a new trip has no start date", () => {
    expect(emptyTrip().startDate).toBeUndefined();
  });

  it("is set, changed and cleared", () => {
    const set = setStartDate(twoDays, "2026-10-31");
    expect(set.startDate).toBe("2026-10-31");
    expect(setStartDate(set, "2026-11-07").startDate).toBe("2026-11-07");
    const cleared = setStartDate(set, undefined);
    expect(cleared.startDate).toBeUndefined();
    expect("startDate" in cleared).toBe(false);
  });

  it.each(["", "tomorrow", "2026-02-30", "2026-13-01", "26-10-31", "2026-10-31T00:00"])(
    "ignores %j, which is not a calendar date",
    (date) => {
      expect(setStartDate(dated, date)).toBe(dated);
    },
  );

  it("setting the same date changes nothing", () => {
    expect(setStartDate(dated, "2026-10-31")).toBe(dated);
    expect(setStartDate(twoDays, undefined)).toBe(twoDays);
  });

  it("is not an edit of the route: undo keeps the current start date", () => {
    const edited = applyEdit(twoDays, { type: "toggleCamp", index: 1 });
    const withDate = setStartDate(edited, "2026-10-31");
    const undone = applyEdit(withDate, { type: "undo" });
    expect(undone.camps).toEqual([1]);
    expect(undone.startDate).toBe("2026-10-31");
  });
});

describe("day dates", () => {
  it("day n falls on the start date + n - 1", () => {
    expect(summarise(dated).days.map((day) => day.date)).toEqual(["2026-10-31", "2026-11-01"]);
  });

  it("crosses month and year ends", () => {
    const newYear = { ...twoDays, startDate: "2026-12-31" };
    expect(summarise(newYear).days.map((day) => day.date)).toEqual(["2026-12-31", "2027-01-01"]);
    const leap = { ...twoDays, startDate: "2028-02-28" };
    expect(summarise(leap).days.map((day) => day.date)).toEqual(["2028-02-28", "2028-02-29"]);
  });

  it("an undated trip's days have no date", () => {
    expect(summarise(twoDays).days.map((day) => day.date)).toEqual([undefined, undefined]);
  });
});

describe("save format reset: version 1 is the only version", () => {
  it("saves as version 1, with the start date when set", () => {
    expect(JSON.parse(serialiseTrip(dated))).toMatchObject({
      format: "packraft-go-trip",
      version: 1,
      trip: { startDate: "2026-10-31", camps: [1] },
    });
  });

  it("does not write a start date for an undated trip", () => {
    expect(JSON.parse(serialiseTrip(twoDays)).trip).not.toHaveProperty("startDate");
  });

  it("round-trips the start date and camps", () => {
    expect(parseTrip(serialiseTrip(dated))).toEqual({ ok: true, trip: dated });
    expect(parseTrip(serialiseTrip(twoDays))).toEqual({ ok: true, trip: twoDays });
  });

  it("restores the start date from browser storage", () => {
    expect(restoreStoredTrip(serialiseTrip(dated))).toEqual({ trip: dated, unknownVersion: false });
  });

  const withVersion = (version: unknown, trip: Trip = dated) =>
    JSON.stringify({ ...JSON.parse(serialiseTrip(trip)), version });

  it.each([2, 0, 3, 99, -1, 1.5])("refuses version %s as an unknown version", (version) => {
    expect(parseTrip(withVersion(version))).toEqual({ ok: false, reason: "unknown-version" });
    expect(restoreStoredTrip(withVersion(version))).toEqual({ trip: emptyTrip(), unknownVersion: true });
  });

  it("refuses the pre-v2 version 2 format, even without a start date", () => {
    expect(parseTrip(withVersion(2, twoDays))).toEqual({ ok: false, reason: "unknown-version" });
  });

  const withStartDate = (startDate: unknown) =>
    JSON.stringify({ format: "packraft-go-trip", version: 1, trip: { ...twoDays, startDate } });

  it.each([["2026-02-30"], ["tomorrow"], [20261031], [null], [""]])(
    "refuses a start date of %j as damaged, not as an unknown version",
    (startDate) => {
      expect(parseTrip(withStartDate(startDate))).toEqual({ ok: false });
    },
  );
});
