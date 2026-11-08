/**
 * Groups your access points whose markers would lie on each other at the current zoom, so
 * zoomed out they show as one marker with a count instead of a cramped pile. Pure: the caller
 * projects each point to screen pixels at the current zoom.
 */

/** Markers whose centres are closer than this (in screen pixels) are grouped: a marker is 24 px. */
export const ACCESS_POINT_GROUP_DISTANCE_PX = 28;

export type Projected<T> = { item: T; x: number; y: number };

/**
 * Greedy, in the given order: each item joins the first group whose first member is within
 * `distance` of it, or starts a new group. Groups keep their members in the given order.
 */
export function groupNearby<T>(items: readonly Projected<T>[], distance = ACCESS_POINT_GROUP_DISTANCE_PX): T[][] {
  const groups: { x: number; y: number; members: T[] }[] = [];
  for (const { item, x, y } of items) {
    const near = groups.find((group) => Math.hypot(group.x - x, group.y - y) < distance);
    if (near) near.members.push(item);
    else groups.push({ x, y, members: [item] });
  }
  return groups.map((group) => group.members);
}
