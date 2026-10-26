import { useState } from "react";
import type { LatLng } from "@/core/trip";
import type { AccessPointsState } from "../useAccessPoints";
import type { MyPosition } from "./position";

/** Marking an access point where you stand, for "Mark here" and the floating button (#119). */
export type MarkAccessPoint = ReturnType<typeof useMarkAccessPoint>;

/**
 * Marks an access point at your GPS position (#63, #119). Without a position
 * yet it asks for one first; without a fix it switches to placing the point
 * on the map, so the next map tap places it.
 */
export function useMarkAccessPoint(
  access: AccessPointsState,
  position: MyPosition,
  showPosition: (onFirst?: (first: MyPosition) => void) => void,
) {
  // Waiting for a position fix (or a failure) to mark the point.
  const [locating, setLocating] = useState(false);
  // How accurate the GPS position was when a point was marked.
  const [accuracy, setAccuracy] = useState<{ id: string; m: number } | null>(null);

  const markAt = (at: LatLng, accuracyM: number) => {
    const id = access.placeAt(at);
    setAccuracy({ id, m: accuracyM });
  };
  const mark = () => {
    if (position.state === "shown") {
      markAt(position.at, position.accuracyM);
      return;
    }
    setLocating(true);
    showPosition((first) => {
      setLocating(false);
      if (first.state === "shown") markAt(first.at, first.accuracyM);
      else access.startPlacing();
    });
  };

  return {
    mark,
    locating,
    /** The GPS accuracy in metres the point `id` was marked with, if it was marked at your position. */
    accuracyOf: (id: string) => (accuracy?.id === id ? accuracy.m : null),
  };
}
