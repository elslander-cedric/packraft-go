import { useState } from "react";
import type { LatLng } from "@/core/trip";
import type { MyPosition } from "./position";

/** The flag button in access point editing (#119, ADR 0036). */
export type MarkAccessPoint = ReturnType<typeof useMarkAccessPoint>;

/**
 * The flag button: opens the details of the new point placed on the map (the
 * draft, in the planner session). With no draft it places one at your GPS
 * position first (`placeDraft`), asking for a position when there is none yet;
 * without a fix it asks you to tap the map, a message shown only while editing
 * access points with no draft. `onMarked` opens the draft's details.
 */
export function useMarkAccessPoint(
  { editing, hasDraft }: { editing: boolean; hasDraft: boolean },
  position: MyPosition,
  showPosition: (onFirst?: (first: MyPosition) => void) => void,
  placeDraft: (at: LatLng) => void,
  onMarked: () => void,
) {
  // Waiting for a position fix (or a failure) to mark the point.
  const [locating, setLocating] = useState(false);
  // No fix: the next map tap places the point. Forgotten once a draft is placed or editing ends.
  const [needsTap, setNeedsTap] = useState(false);
  if (needsTap && (!editing || hasDraft)) setNeedsTap(false);

  const mark = () => {
    setNeedsTap(false);
    if (hasDraft) {
      onMarked();
      return;
    }
    if (position.state === "shown") {
      placeDraft(position.at);
      onMarked();
      return;
    }
    setLocating(true);
    showPosition((first) => {
      setLocating(false);
      if (first.state === "shown") {
        placeDraft(first.at);
        onMarked();
      } else setNeedsTap(true);
    });
  };

  return { mark, locating, needsTap: needsTap && editing && !hasDraft };
}
