import { useState } from "react";
import type { LatLng } from "@/core/trip";
import type { AccessPointsState } from "../useAccessPoints";
import type { MyPosition } from "./position";

/** Marking an access point where you stand, for the floating button (#119). */
export type MarkAccessPoint = ReturnType<typeof useMarkAccessPoint>;

/**
 * Marks an access point at your GPS position (#63, #119). Without a position
 * yet it asks for one first; without a fix it switches to placing the point
 * on the map, so the next map tap places it. `onMarked` gets the new point's id.
 */
export function useMarkAccessPoint(
  access: AccessPointsState,
  position: MyPosition,
  showPosition: (onFirst?: (first: MyPosition) => void) => void,
  onMarked: (id: string) => void,
) {
  // Waiting for a position fix (or a failure) to mark the point.
  const [locating, setLocating] = useState(false);

  const markAt = (at: LatLng) => onMarked(access.placeAt(at));
  const mark = () => {
    if (position.state === "shown") {
      markAt(position.at);
      return;
    }
    setLocating(true);
    showPosition((first) => {
      setLocating(false);
      if (first.state === "shown") markAt(first.at);
      else access.startPlacing();
    });
  };

  return { mark, locating };
}
