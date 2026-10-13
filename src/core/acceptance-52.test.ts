// Tester acceptance tests for #52: trip start date and save format reset
// (ADR 0011 amendment "format reset", ADR 0022). Written from the issue and
// spec #51 before reading the diff.
import { afterEach, describe, expect, it } from "vitest";
import { formatDayDate } from "../ui/format";
import { parseTrip, restoreStoredTrip, restoreTrip, serialiseTrip, SAVE_VERSION } from "./saveFile";
import { summarise } from "./summarise";
import { applyEdit, canUndo, emptyTrip, setStartDate, type Trip } from "./trip";

const points = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 50.3 + i / 100, lng: 5.6 + i / 100 }));

/** A trip of `legs` hike legs, with camps at the given point indices. */
const tripWith = (legs: number, camps: number[] = [], startDate?: string): Trip => ({
  name: "Lesse",
  points: points(legs + 1),
  legs: Array.from({ length: legs }, () => ({ mode: "hike" as const })),
  ...(camps.length ? { camps } : {}),
  ...(startDate ? { startDate } : {}),
});

/** Six legs split into one day per leg: camps on every inner point. */
const sixDays = (startDate?: string) => tripWith(6, [1, 2, 3, 4, 5], startDate);
const dates = (trip: Trip) => summarise(trip).days.map((day) => day.date);

const ZONES = ["Europe/Brussels", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Los_Angeles", "UTC"];
const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("#52 AC1: day n = start date + n - 1", () => {
  it.each([
    ["month end", "2026-10-29", ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]],
    ["year end", "2026-12-29", ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]],
    ["no leap day in 2027", "2027-02-26", ["2027-02-26", "2027-02-27", "2027-02-28", "2027-03-01", "2027-03-02", "2027-03-03"]],
    ["leap day in 2028", "2028-02-27", ["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03"]],
    ["spring DST change (Brussels)", "2026-03-27", ["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31", "2026-04-01"]],
    ["autumn DST change (Brussels)", "2026-10-23", ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]],
  ])("across a %s", (_label, start, expected) => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(dates(sixDays(start)), zone).toEqual(expected);
    }
  });

  it("a single-day trip (no camps) gets the start date", () => {
    expect(dates(tripWith(3, [], "2026-10-31"))).toEqual(["2026-10-31"]);
  });

  it("an undated trip has no day dates", () => {
    expect(dates(sixDays())).toEqual(Array(6).fill(undefined));
  });

  it("a trip with no legs has no days and no dates", () => {
    expect(summarise(setStartDate(emptyTrip(), "2026-10-31")).days).toEqual([]);
  });
});

describe("#52: camps and days still line up with dates", () => {
  const dated = tripWith(6, [2, 4], "2026-10-31");

  it("each day keeps its legs and gets the next date", () => {
    const days = summarise(dated).days;
    expect(days.map((d) => [d.firstLeg, d.lastLeg, d.date])).toEqual([
      [0, 1, "2026-10-31"],
      [2, 3, "2026-11-01"],
      [4, 5, "2026-11-02"],
    ]);
  });

  it("the day summaries are the undated ones plus a date", () => {
    const undated = summarise({ ...dated, startDate: undefined }).days;
    const days = summarise(dated).days;
    expect(days.map((day) => ({ ...day, date: undefined }))).toEqual(undated.map((day) => ({ ...day, date: undefined })));
    expect(days.every((day) => day.date !== undefined)).toBe(true);
  });

  it("removing a camp shifts the following days' dates back by one", () => {
    const fewer = applyEdit(dated, { type: "toggleCamp", index: 2 });
    expect(dates(fewer)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(dates(applyEdit(fewer, { type: "undo" }))).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("a camp on the start or end point adds no day and no date", () => {
    expect(dates(tripWith(3, [0, 3], "2026-10-31"))).toEqual(["2026-10-31"]);
  });
});

describe("#52 AC1: set, change and clear", () => {
  it("set, change, clear, and set again", () => {
    let trip = setStartDate(sixDays(), "2026-10-31");
    expect(trip.startDate).toBe("2026-10-31");
    trip = setStartDate(trip, "2027-01-01");
    expect(dates(trip)[0]).toBe("2027-01-01");
    trip = setStartDate(trip, undefined);
    expect(trip.startDate).toBeUndefined();
    expect(JSON.parse(serialiseTrip(trip)).trip).not.toHaveProperty("startDate");
    expect(setStartDate(trip, undefined)).toBe(trip); // clearing twice is harmless
    expect(setStartDate(trip, "2026-10-31").startDate).toBe("2026-10-31");
  });

  it("setting the date is not an undoable route edit and does not add an undo step", () => {
    const trip = setStartDate(emptyTrip(), "2026-10-31");
    expect(canUndo(trip)).toBe(false);
  });

  it("a new trip is undated", () => {
    expect(emptyTrip()).not.toHaveProperty("startDate");
  });

  it.each(["2026-02-29", "2026-04-31", "2026-00-10", "2026-1-5", " 2026-10-31", "31/10/2026"])(
    "rejects %j",
    (bad) => {
      expect(setStartDate(sixDays(), bad).startDate).toBeUndefined();
    },
  );
});

describe("#52 AC2/AC3: saves are version 1 and keep the start date", () => {
  it("writes version 1", () => {
    expect(SAVE_VERSION).toBe(1);
    for (const trip of [emptyTrip(), sixDays(), sixDays("2026-10-31")]) {
      expect(JSON.parse(serialiseTrip(trip))).toMatchObject({ format: "packraft-go-trip", version: 1 });
    }
  });

  it("round-trips the start date through file and autosave", () => {
    const trip = sixDays("2028-02-29");
    expect(parseTrip(serialiseTrip(trip))).toEqual({ ok: true, trip });
    expect(restoreStoredTrip(serialiseTrip(trip))).toEqual({ trip, unknownVersion: false });
    expect(dates((parseTrip(serialiseTrip(trip)) as { trip: Trip }).trip)[1]).toBe("2028-03-01");
  });

  it("stores the date as plain YYYY-MM-DD text, not a timestamp", () => {
    expect(serialiseTrip(sixDays("2026-10-31"))).toContain('"startDate":"2026-10-31"');
  });
});

describe("#52 AC3: the old version 2 and other versions are refused (#28 for autosave)", () => {
  const body = { ...sixDays("2026-10-31") };
  const file = (version: unknown, trip: object = body) => JSON.stringify({ format: "packraft-go-trip", version, trip });

  it.each([2, 0, 3, 99, -1, 1.5, 2.0])("version %s: file gets unknown-version, autosave is flagged", (version) => {
    expect(parseTrip(file(version))).toEqual({ ok: false, reason: "unknown-version" });
    expect(restoreStoredTrip(file(version))).toEqual({ trip: emptyTrip(), unknownVersion: true });
    expect(restoreTrip(file(version))).toEqual(emptyTrip());
  });

  it("a real pre-reset version 2 save (camps, no start date) is refused", () => {
    const old = file(2, { name: "Old", points: points(3), legs: [{ mode: "hike" }, { mode: "paddle" }], camps: [1] });
    expect(parseTrip(old)).toEqual({ ok: false, reason: "unknown-version" });
    expect(restoreStoredTrip(old).unknownVersion).toBe(true);
  });

  it.each(["1", "2", null])("version %j (not a number) is damaged, not unknown", (version) => {
    expect(parseTrip(file(version))).toEqual({ ok: false });
    expect(restoreStoredTrip(file(version))).toEqual({ trip: emptyTrip(), unknownVersion: false });
  });

  it.each([["2026-02-30"], ["2026-10-31T00:00:00Z"], [1793404800000], [{}], ["31/10/2026"]])(
    "version 1 with start date %j is damaged, not unknown, and autosave is not flagged",
    (startDate) => {
      expect(parseTrip(file(1, { ...body, startDate }))).toEqual({ ok: false });
      expect(restoreStoredTrip(file(1, { ...body, startDate }))).toEqual({ trip: emptyTrip(), unknownVersion: false });
    },
  );
});

describe("#52: date display does not shift with the time zone", () => {
  it.each([
    ["2026-10-31", "Sat 31 Oct 2026"],
    ["2026-03-29", "Sun 29 Mar 2026"],
    ["2026-10-25", "Sun 25 Oct 2026"],
    ["2027-01-01", "Fri 1 Jan 2027"],
    ["2028-02-29", "Tue 29 Feb 2028"],
  ])("%s shows as %s in every zone", (date, shown) => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(formatDayDate(date), zone).toBe(shown);
    }
  });
});
