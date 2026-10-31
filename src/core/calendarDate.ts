// Calendar dates (GLOSSARY "Start date"): plain dates without a time or time
// zone, written as ISO "YYYY-MM-DD" text, e.g. "2026-10-31".

/** An ISO calendar date, "YYYY-MM-DD". Check text with `isCalendarDate`. */
export type CalendarDate = string;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True when `value` is "YYYY-MM-DD" text naming a real day (no 30 February). */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/** The date `days` days after `date` (counted in UTC, so no daylight saving shifts). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const start = Date.parse(`${date}T00:00:00Z`);
  return new Date(start + days * MS_PER_DAY).toISOString().slice(0, 10);
}

const brussels = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar date in Europe/Brussels at the instant `now` (#124): the day a
 * new trip starts on, whatever time zone the device is set to, so a date
 * picked in Brussels never moves a day.
 */
export function todayInBrussels(now: Date): CalendarDate {
  const parts = Object.fromEntries(brussels.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
