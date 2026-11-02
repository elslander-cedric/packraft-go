// Obstacles (ADR 0035, GLOSSARY "Obstacle"): the fixed things the SPW marks on Walloon
// rivers, shipped with the app. Read-only, and independent of date and flow. The SPW
// publishes only a position and a code, so what an obstacle means is the app's own
// cautious wording, in strings.ts.
import type { AccessSource, Position } from "./access";
import type { CalendarDate } from "./calendarDate";

export const obstacleKinds = ["dam", "impassable", "rocks", "drossage", "low-bridge"] as const;
export type ObstacleKind = (typeof obstacleKinds)[number];

export type Obstacle = {
  /** Unique among everything the access layer can select. */
  readonly id: string;
  /** The SPW's id for the obstacle. */
  readonly spwId: number;
  readonly kind: ObstacleKind;
  readonly position: Position;
  /** When the SPW last changed it. */
  readonly lastChanged: CalendarDate;
  /** Where the snapshot comes from, and when it was taken. */
  readonly source: AccessSource;
  readonly snapshot: CalendarDate;
};
