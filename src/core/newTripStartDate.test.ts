// A new trip in the planner starts with today as its start date (#124, spec #114
// stories 57 and 55). Seams: the planner session's new-trip path, and today's
// calendar date in Europe/Brussels.
import { describe, expect, it } from "vitest";
import { todayInBrussels } from "./calendarDate";
import { firstSession, plannerSession } from "./plannerSession";
import { applyEdit, emptyTrip, setStartDate, type Trip } from "./trip";

const A = { lat: 50.3527, lng: 5.4563 };
const B = { lat: 50.3627, lng: 5.4563 };
const withPoints: Trip = setStartDate(
  [A, B].reduce((trip, at) => applyEdit(trip, { type: "addPoint", at }), emptyTrip()),
  "2026-05-01",
);
const blank = firstSession({ trip: { name: "Named but empty", points: [], legs: [] } });

describe("new trip with a start date", () => {
  it("sets the start date when one is given", () => {
    const next = plannerSession(blank, { type: "newTrip", startDate: "2026-10-26" });
    expect(next.trip).toEqual({ name: "", points: [], legs: [], startDate: "2026-10-26" });
  });

  it("starts undated without one, as before #124", () => {
    const next = plannerSession(blank, { type: "newTrip" });
    expect(next.trip).toEqual({ name: "", points: [], legs: [] });
    expect("startDate" in next.trip).toBe(false);
  });

  it("keeps the date through the confirm-replace question", () => {
    const asked = plannerSession(firstSession({ trip: withPoints }), { type: "newTrip", startDate: "2026-10-26" });
    expect(asked.trip).toBe(withPoints);
    const confirmed = plannerSession(asked, { type: "confirmReplace" });
    expect(confirmed.trip).toEqual({ name: "", points: [], legs: [], startDate: "2026-10-26" });
  });

  it("cancelling the question keeps the current trip and its date", () => {
    const asked = plannerSession(firstSession({ trip: withPoints }), { type: "newTrip", startDate: "2026-10-26" });
    expect(plannerSession(asked, { type: "cancelReplace" }).trip.startDate).toBe("2026-05-01");
  });
});

describe("today in Europe/Brussels", () => {
  it.each([
    // Winter time (UTC+1): late evening UTC is already the next day in Brussels.
    ["2026-01-15T22:59:59Z", "2026-01-15"],
    ["2026-01-15T23:00:00Z", "2026-01-16"],
    // Summer time (UTC+2).
    ["2026-06-30T21:59:59Z", "2026-06-30"],
    ["2026-06-30T22:00:00Z", "2026-07-01"],
    // The night summer time ends (25 October 2026, 03:00 -> 02:00).
    ["2026-10-24T22:30:00Z", "2026-10-25"],
    ["2026-10-25T22:59:00Z", "2026-10-25"],
    ["2026-10-25T23:00:00Z", "2026-10-26"],
    // Early morning in Brussels is still the same day, never the day before.
    ["2026-03-29T00:30:00Z", "2026-03-29"],
  ])("at %s it is %s", (instant, day) => {
    expect(todayInBrussels(new Date(instant))).toBe(day);
  });
});
