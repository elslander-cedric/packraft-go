// The Walloon AGW rules by category (AGW of 19 March 2009, art. 4; GLOSSARY:
// Access status). Pure calendar arithmetic on "YYYY-MM-DD" dates, so a date
// never moves a day with the time zone.
import type { CalendarDate } from "./calendarDate";

/** AGW Annex 1 category: 1.A navigable, 1.B non-navigable all year, 1.C non-navigable in winter only. */
export type AgwCategory = "1.A" | "1.B" | "1.C";

export type AgwHours = { readonly from: string; readonly to: string };
export type AgwHoursPeriod = AgwHours & {
  /** The period as text, e.g. "16 Jun - 30 Sep". */
  readonly period: string;
};

/** Why a stretch is closed on a date: outside its season, or a fishing opening day. */
export type AgwClosure = "season" | "fishing-day";

export type AgwDay = {
  readonly closure?: AgwClosure;
  /** The permitted hours on that date (also when closed, for reference). */
  readonly hours: AgwHours;
};

const SATURDAY = 6;

const pad = (n: number) => String(n).padStart(2, "0");

/** The n-th Saturday (1-based) of a month, as YYYY-MM-DD. Counted in UTC. */
function nthSaturday(year: number, month: number, n: number): CalendarDate {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstSaturday = 1 + ((SATURDAY - firstWeekday + 7) % 7);
  return `${year}-${pad(month)}-${pad(firstSaturday + 7 * (n - 1))}`;
}

/** The fishing opening days of a year: the 3rd Saturday of March (trout) and the 1st Saturday of June (general). */
export function fishingOpeningDays(year: number): { trout: CalendarDate; general: CalendarDate } {
  return { trout: nthSaturday(year, 3, 3), general: nthSaturday(year, 6, 1) };
}

/** Month and day as a sortable number, e.g. 16 March is 316. */
const monthDay = (date: CalendarDate) => Number(date.slice(5, 7)) * 100 + Number(date.slice(8, 10));

type Period = AgwHoursPeriod & { readonly contains: (md: number) => boolean };

const winterSummer: readonly Period[] = [
  { period: "1 Oct - 15 Jun", from: "10:00", to: "17:00", contains: (md) => md >= 1001 || md <= 615 },
  { period: "16 Jun - 30 Sep", from: "09:30", to: "18:00", contains: (md) => md >= 616 && md <= 930 },
];

const hoursTables: Record<AgwCategory, readonly Period[]> = {
  "1.A": [
    { period: "16 Mar - 15 Jun", from: "09:30", to: "19:00", contains: (md) => md >= 316 && md <= 615 },
    { period: "16 Jun - 15 Oct", from: "09:30", to: "20:00", contains: (md) => md >= 616 && md <= 1015 },
    { period: "16 Oct - 15 Mar", from: "09:30", to: "17:00", contains: (md) => md >= 1016 || md <= 315 },
  ],
  "1.B": winterSummer,
  "1.C": winterSummer,
};

/** Every period of a category with its hours, for showing the rules without a date. */
export function agwHoursTable(category: AgwCategory): AgwHoursPeriod[] {
  return hoursTables[category].map(({ period, from, to }) => ({ period, from, to }));
}

/** Whether a 1.C stretch is in season on the date: 1 October to 15 March. */
export function inSeason1C(date: CalendarDate): boolean {
  const md = monthDay(date);
  return md >= 1001 || md <= 315;
}

/** What the AGW says about a category on one date: closed or not, and the permitted hours. */
export function agwDay(category: AgwCategory, date: CalendarDate): AgwDay {
  const md = monthDay(date);
  const { from, to } = hoursTables[category].find((p) => p.contains(md))!;
  const hours = { from, to };
  if (category === "1.C" && !inSeason1C(date)) return { closure: "season", hours };
  if (category !== "1.A") {
    const { trout, general } = fishingOpeningDays(Number(date.slice(0, 4)));
    if (date === trout || date === general) return { closure: "fishing-day", hours };
  }
  return { hours };
}
