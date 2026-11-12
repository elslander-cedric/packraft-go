import { useState } from "react";
import type { AccessPointsState } from "../useAccessPoints";
import type { MyPosition } from "./position";

/** The flag button in access point editing (ADR 0036). */
export type MarkAccessPoint = ReturnType<typeof useMarkAccessPoint>;

/**
 * The flag button: opens the details of the new point placed on the map (the
 * draft). With no draft it places one at your GPS position first, asking for a
 * position when there is none yet; without a fix it asks you to tap the map.
 * `onMarked` opens the draft's details.
 */
export function useMarkAccessPoint(
  access: AccessPointsState,
  position: MyPosition,
  showPosition: (onFirst?: (first: MyPosition) => void) => void,
  onMarked: () => void,
) {
  // Waiting for a position fix (or a failure) to mark the point.
  const [locating, setLocating] = useState(false);
  // No fix: the next map tap places the point. Cleared once a draft is placed.
  const [needsTap, setNeedsTap] = useState(false);

  const markAccessPoint = () => {
    setNeedsTap(false);
    if (access.draft) {
      onMarked();
      return;
    }
    if (position.state === "shown") {
      access.placeDraft(position.at);
      onMarked();
      return;
    }
    setLocating(true);
    showPosition((first) => {
      setLocating(false);
      if (first.state === "shown") {
        access.placeDraft(first.at);
        onMarked();
      } else {
        setNeedsTap(true);
      }
    });
  };

  return {
    mark: markAccessPoint,
    locating,
    needsTap: needsTap && access.draft === null,
    clearNeedsTap: () => setNeedsTap(false),
  };
}
