import type { Point } from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "@/core/trip";
import { HOLD_MS, isPrimaryPress } from "./hold";

/** Two taps this close in time and place are one double tap, which does nothing. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 40;

/** The leg a leg hit line's element stands for (#230), kept on the element. */
export const LEG_HIT_ATTRIBUTE = "data-leg";
function legOf(target: EventTarget | null): number | null {
  const leg = target instanceof Element ? target.getAttribute(LEG_HIT_ATTRIBUTE) : null;
  return leg === null ? null : Number(leg);
}

/**
 * Turns taps into `onMapTap`, or `onLegTap` when the tap is on a leg's hit line (#230). A
 * double tap gives one tap (its second tap is ignored), and the click that can follow a pinch
 * is ignored. So is the click that ends a finger or the mouse held for 0.4 s or more: holding
 * the map does nothing, and holding a leg inserts a point instead (#122, ADR 0034); a tap
 * right after a hold is a tap.
 */
export function Taps({ onTap, onLegTap }: { onTap: (at: LatLng) => void; onLegTap: (leg: number) => void }) {
  const map = useMap();
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const pinched = useRef(false);
  const pressedAt = useRef<number | null>(null);
  useEffect(() => {
    const container = map.getContainer();
    // Capture phase, before Leaflet's own handlers.
    const notePinch = (event: TouchEvent) => {
      pinched.current = event.touches.length > 1;
    };
    const notePressTime = (event: PointerEvent) => {
      pressedAt.current = isPrimaryPress(event) ? event.timeStamp : null;
    };
    container.addEventListener("touchstart", notePinch, true);
    container.addEventListener("pointerdown", notePressTime, true);
    return () => {
      container.removeEventListener("touchstart", notePinch, true);
      container.removeEventListener("pointerdown", notePressTime, true);
    };
  }, [map]);
  useMapEvents({
    click: (event) => {
      const now = event.originalEvent.timeStamp;
      const previous = lastTap.current;
      lastTap.current = { at: now, point: event.containerPoint };
      if (pinched.current) {
        return;
      }
      const downAt = pressedAt.current;
      pressedAt.current = null;
      // A hold is not a tap, so it doesn't start a double tap either.
      if (downAt !== null && now - downAt >= HOLD_MS) {
        lastTap.current = previous;
        return;
      }
      if (
        previous &&
        now - previous.at < DOUBLE_TAP_MS &&
        previous.point.distanceTo(event.containerPoint) < DOUBLE_TAP_PX
      ) {
        return;
      }
      const leg = legOf(event.originalEvent.target);
      if (leg !== null) {
        onLegTap(leg);
      } else {
        onTap({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    },
  });
  return null;
}
