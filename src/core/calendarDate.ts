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
