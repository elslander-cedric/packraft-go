import type { Point } from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "@/core/trip";
import { HOLD_MS, isPrimaryPress } from "./hold";

/** Two taps this close in time and place are one double tap, which does nothing. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 40;

/** The leg a leg hit line's element stands for, kept on the element. */
export const LEG_HIT_ATTRIBUTE = "data-leg";
/** The suggested trip a hit line stands for (ADR 0039), by its index. */
export const SUGGESTED_TRIP_HIT_ATTRIBUTE = "data-suggested-trip";
function hitOf(target: EventTarget | null, attribute: string): number | null {
  const index = target instanceof Element ? target.getAttribute(attribute) : null;
  return index === null ? null : Number(index);
}

export type TapsProps = {
  onTap: (at: LatLng) => void;
  onLegTap: (leg: number) => void;
  onSuggestedTripTap?: (index: number) => void;
};

/**
 * Turns taps into `onMapTap`, or `onLegTap` when the tap is on a leg's hit line, or
 * `onSuggestedTripTap` on a suggested trip's. A
 * double tap gives one tap (its second tap is ignored), and the click that can follow a pinch
 * is ignored. So is the click that ends a finger or the mouse held for 0.4 s or more: holding
 * the map does nothing, and holding a leg inserts a point instead (ADR 0034); a tap
 * right after a hold is a tap.
 */
export function Taps({ onTap, onLegTap, onSuggestedTripTap }: TapsProps) {
  const map = useMap();
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const pinched = useRef(false);
  const pressedAt = useRef<number | null>(null);
  useEffect(() => {
    const container = map.getContainer();
    // Capture phase, before Leaflet's own handlers.
    const touch = (event: TouchEvent) => {
      pinched.current = event.touches.length > 1;
    };
    const down = (event: PointerEvent) => {
      pressedAt.current = isPrimaryPress(event) ? event.timeStamp : null;
    };
    container.addEventListener("touchstart", touch, true);
    container.addEventListener("pointerdown", down, true);
    return () => {
      container.removeEventListener("touchstart", touch, true);
      container.removeEventListener("pointerdown", down, true);
    };
  }, [map]);
  useMapEvents({
    click: (event) => {
      const now = event.originalEvent.timeStamp;
      const previous = lastTap.current;
      lastTap.current = { at: now, point: event.containerPoint };
      if (pinched.current) return;
      const downAt = pressedAt.current;
      pressedAt.current = null;
      // A hold is not a tap, so it doesn't start a double tap either.
      if (downAt !== null && now - downAt >= HOLD_MS) {
        lastTap.current = previous;
        return;
      }
      if (previous && now - previous.at < DOUBLE_TAP_MS && previous.point.distanceTo(event.containerPoint) < DOUBLE_TAP_PX) {
        return;
      }
      const { target } = event.originalEvent;
      const leg = hitOf(target, LEG_HIT_ATTRIBUTE);
      const suggestedTrip = hitOf(target, SUGGESTED_TRIP_HIT_ATTRIBUTE);
      if (leg !== null) onLegTap(leg);
      else if (suggestedTrip !== null) onSuggestedTripTap?.(suggestedTrip);
      else onTap({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}
