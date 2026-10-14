// Seam 1: the Walloon AGW rules by category (art. 4 of the AGW of 19 March 2009):
// seasons, the two fishing opening days and the permitted hours. Every case
// uses an explicit calendar date.
import { describe, expect, it } from "vitest";
import { agwDay, agwHoursTable, fishingOpeningDays, type AgwCategory } from "./agw";

const closure = (category: AgwCategory, date: string) => agwDay(category, date).closure;
const hours = (category: AgwCategory, date: string) => {
  const { from, to } = agwDay(category, date).hours;
  return `${from}-${to}`;
};

describe("fishing opening days", () => {
  it("are the 3rd Saturday of March and the 1st Saturday of June", () => {
    expect(fishingOpeningDays(2026)).toEqual({ trout: "2026-03-21", general: "2026-06-06" });
    expect(fishingOpeningDays(2027)).toEqual({ trout: "2027-03-20", general: "2027-06-05" });
    expect(fishingOpeningDays(2024)).toEqual({ trout: "2024-03-16", general: "2024-06-01" });
    // The 3rd Saturday of March is at the earliest the 15th.
    expect(fishingOpeningDays(2025)).toEqual({ trout: "2025-03-15", general: "2025-06-07" });
    expect(fishingOpeningDays(2022).general).toBe("2022-06-04");
  });
});

describe("1.A navigable stretches: all year, no fishing days", () => {
  it.each(["2026-01-10", "2026-03-21", "2026-06-06", "2026-07-15", "2026-12-24"])("%s is open", (date) => {
    expect(closure("1.A", date)).toBeUndefined();
  });
});

describe("1.B: all year except the two fishing opening days", () => {
  it("is open on ordinary days, including the day before and after a fishing day", () => {
    for (const date of ["2026-03-20", "2026-03-22", "2026-06-05", "2026-06-07", "2026-08-01", "2026-01-02"]) {
      expect(closure("1.B", date)).toBeUndefined();
    }
  });
  it("is closed on the fishing opening days", () => {
    expect(closure("1.B", "2026-03-21")).toBe("fishing-day");
    expect(closure("1.B", "2026-06-06")).toBe("fishing-day");
    expect(closure("1.B", "2027-03-20")).toBe("fishing-day");
    expect(closure("1.B", "2027-06-05")).toBe("fishing-day");
  });
  it("is open on other Saturdays in March and June", () => {
    expect(closure("1.B", "2026-03-14")).toBeUndefined();
    expect(closure("1.B", "2026-03-28")).toBeUndefined();
    expect(closure("1.B", "2026-06-13")).toBeUndefined();
  });
});

describe("1.C: open 1 October to 15 March only, except the fishing opening days", () => {
  it("is open on the season's first and last days", () => {
    expect(closure("1.C", "2026-10-01")).toBeUndefined();
    expect(closure("1.C", "2027-03-15")).toBeUndefined();
    expect(closure("1.C", "2026-01-01")).toBeUndefined();
    expect(closure("1.C", "2026-12-31")).toBeUndefined();
  });
  it("is closed for the season on 16 March and on 30 September", () => {
    expect(closure("1.C", "2026-03-16")).toBe("season");
    expect(closure("1.C", "2026-09-30")).toBe("season");
  });
  it("is closed for the season in July", () => {
    expect(closure("1.C", "2026-07-15")).toBe("season");
    expect(closure("1.C", "2026-04-01")).toBe("season");
  });
  it("is closed on the trout opening day when it falls inside the season (15 March 2025)", () => {
    expect(closure("1.C", "2025-03-15")).toBe("fishing-day");
  });
  it("on a fishing day outside the season, the season is the reason", () => {
    expect(closure("1.C", "2026-03-21")).toBe("season");
    expect(closure("1.C", "2026-06-06")).toBe("season");
  });
  it("is open on the day before the trout opening day inside the season", () => {
    expect(closure("1.C", "2025-03-14")).toBeUndefined();
  });
});

describe("permitted hours (art. 4 §2)", () => {
  it("1.B and 1.C: 10:00-17:00 from 1 Oct to 15 Jun", () => {
    for (const category of ["1.B", "1.C"] as const) {
      expect(hours(category, "2026-10-01")).toBe("10:00-17:00");
      expect(hours(category, "2026-12-25")).toBe("10:00-17:00");
      expect(hours(category, "2027-03-01")).toBe("10:00-17:00");
      expect(hours(category, "2026-06-15")).toBe("10:00-17:00");
    }
  });
  it("1.B and 1.C: 9:30-18:00 from 16 Jun to 30 Sep", () => {
    for (const category of ["1.B", "1.C"] as const) {
      expect(hours(category, "2026-06-16")).toBe("09:30-18:00");
      expect(hours(category, "2026-08-15")).toBe("09:30-18:00");
      expect(hours(category, "2026-09-30")).toBe("09:30-18:00");
    }
  });
  it("1.A: 9:30-19:00 from 16 Mar to 15 Jun", () => {
    expect(hours("1.A", "2026-03-16")).toBe("09:30-19:00");
    expect(hours("1.A", "2026-05-01")).toBe("09:30-19:00");
    expect(hours("1.A", "2026-06-15")).toBe("09:30-19:00");
  });
  it("1.A: 9:30-20:00 from 16 Jun to 15 Oct", () => {
    expect(hours("1.A", "2026-06-16")).toBe("09:30-20:00");
    expect(hours("1.A", "2026-08-01")).toBe("09:30-20:00");
    expect(hours("1.A", "2026-10-15")).toBe("09:30-20:00");
  });
  it("1.A: 9:30-17:00 from 16 Oct to 15 Mar", () => {
    expect(hours("1.A", "2026-10-16")).toBe("09:30-17:00");
    expect(hours("1.A", "2026-12-31")).toBe("09:30-17:00");
    expect(hours("1.A", "2027-01-20")).toBe("09:30-17:00");
    expect(hours("1.A", "2027-03-15")).toBe("09:30-17:00");
  });
  it("lists every period of a category for the date-less view", () => {
    expect(agwHoursTable("1.A")).toHaveLength(3);
    expect(agwHoursTable("1.B")).toEqual(agwHoursTable("1.C"));
    expect(agwHoursTable("1.B")).toHaveLength(2);
  });
});
