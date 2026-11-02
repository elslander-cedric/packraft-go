// Official aires (ADR 0035, GLOSSARY "Official aire"): the aires the SPW publishes,
// shipped with the app. Read-only, and not access points: never written to access
// point storage, trips or settings.
import type { AccessSource, Position } from "./access";
import type { AccessPointUse } from "./accessPoints";
import type { CalendarDate } from "./calendarDate";

export type OfficialAire = {
  /** Unique among everything the access layer can select. */
  readonly id: string;
  /** The SPW's number for the aire. */
  readonly number: number;
  /** The SPW's French name (ADR 0027: local names). */
  readonly name: string;
  readonly use: AccessPointUse;
  /** The id of its official stretch. */
  readonly officialStretch: string;
  readonly position: Position;
  /** When the SPW last changed it. */
  readonly lastChanged: CalendarDate;
  /** Where the snapshot comes from, and when it was taken. */
  readonly source: AccessSource;
  readonly snapshot: CalendarDate;
};

/** An SPW stretch (GLOSSARY "Official stretch"): not always the same as an AGW Annex 1 stretch. */
export type OfficialStretch = {
  /** The SPW's `nomtro`, e.g. "SEMOIS2-3". */
  readonly id: string;
  /** The SPW's French name. */
  readonly name: string;
};
