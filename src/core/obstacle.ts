// Obstacles (ADR 0035, GLOSSARY "Obstacle"): the fixed things the SPW marks on Walloon
// rivers, shipped with the app. Read-only, and independent of date and flow. The SPW
// publishes only a position and a code, so what an obstacle means is the app's own
// cautious wording, in strings.ts. A paddle leg that passes one gets a warning, as for a
// lock (#215). Information only: it never blocks and never changes the access status.
import type { AccessSource, Position } from "./access";
import type { CalendarDate } from "./calendarDate";
import { markersPassedInOrder } from "./locks";
import type { LatLng } from "./trip";

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

/** One obstacle a paddle leg passes. */
export type ObstacleWarning = {
  readonly obstacle: Obstacle;
  readonly leg: number;
  /** Index of the leg's day, counted from 0. */
  readonly day: number;
  readonly date?: CalendarDate;
};

/** The obstacles a leg's line passes, in the order the leg meets them. */
export function obstaclesOnLine(line: readonly LatLng[], obstacles: readonly Obstacle[]): Obstacle[] {
  return markersPassedInOrder(line, obstacles);
}

/** The obstacles of one kind among a leg's warnings. */
export type ObstacleGroup = {
  readonly kind: ObstacleKind;
  readonly obstacles: readonly Obstacle[];
};

/**
 * A leg's warnings gathered by kind, so a long stretch reads as one line per kind (#215):
 * the kinds in the order the leg first meets each.
 */
export function obstacleGroups(warnings: readonly ObstacleWarning[]): ObstacleGroup[] {
  const found = warnings.map((warning) => warning.obstacle);
  const kinds = [...new Set(found.map((obstacle) => obstacle.kind))];
  return kinds.map((kind) => ({ kind, obstacles: found.filter((obstacle) => obstacle.kind === kind) }));
}
