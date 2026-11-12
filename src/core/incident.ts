// Incidents (ADR 0035, GLOSSARY "Incident"): the temporary hazards the SPW reports on a
// river. They come live and need signal. Kept apart from the access status on purpose:
// nothing here reaches `accessAt`, so an incident never changes an access state, even
// when its text says the river is closed. A paddle leg that passes one gets a warning
// with its text, as for an obstacle. Information only: it never blocks.
import type { Position } from "./access";
import type { CalendarDate } from "./calendarDate";
import { markersPassedInOrder } from "./locks";
import type { LatLng } from "./trip";

export type Incident = {
  /** Unique among everything the access layer can select. */
  readonly id: string;
  /** The SPW's id for the incident. */
  readonly spwId: number;
  /** The id of its official stretch. */
  readonly officialStretch?: string;
  readonly position: Position;
  /** The SPW's text in English, when it gives one. */
  readonly textEn?: string;
  /** The SPW's text in French, when it gives one. */
  readonly textFr?: string;
  /** The day the SPW reported it. Incidents can be years old, so it's always shown. */
  readonly created?: CalendarDate;
  /** The day the SPW last changed it. */
  readonly changed?: CalendarDate;
  /** The last day it applies. Most incidents have none. */
  readonly expires?: CalendarDate;
};

/** Today's incidents. `failed` means none could be loaded, which isn't the same as there being none. */
export type OfficialIncidents =
  | { readonly status: "ok"; readonly incidents: readonly Incident[] }
  | { readonly status: "failed" };

/** One incident a paddle leg passes. */
export type IncidentWarning = {
  readonly incident: Incident;
  readonly leg: number;
  /** Index of the leg's day, counted from 0. */
  readonly day: number;
  readonly date?: CalendarDate;
};

/** The incidents a leg's line passes, in the order the leg meets them. */
export function incidentsOnLine(line: readonly LatLng[], incidents: readonly Incident[]): Incident[] {
  return markersPassedInOrder(line, incidents);
}

/** The incidents that apply on a date: all but those whose expiry is before it. */
export function incidentsOn(incidents: readonly Incident[], date: CalendarDate): readonly Incident[] {
  // YYYY-MM-DD strings order as calendar days, so no time zone can move this.
  return incidents.filter(({ expires }) => expires === undefined || expires >= date);
}

/** The SPW's own wording: in English, falling back to French. */
export const incidentText = ({ textEn, textFr }: Incident): string | undefined => textEn ?? textFr;
