import { useEffect, useRef, useState } from "react";
import { positionFailure, type MyPosition } from "./position";

/**
 * Your position from the browser's Geolocation API, only once asked for:
 * the browser asks for permission on the first request, never on load (#56).
 * Once shown, the position follows you until the screen closes.
 */
export function usePosition(): [MyPosition, () => void] {
  const [position, setPosition] = useState<MyPosition>({ state: "off" });
  const watch = useRef<number | null>(null);

  const stopWatching = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
  };
  useEffect(() => stopWatching, []);

  const show = () => {
    if (!("geolocation" in navigator)) {
      setPosition({ state: "failed", reason: "unsupported" });
      return;
    }
    stopWatching();
    setPosition({ state: "locating" });
    watch.current = navigator.geolocation.watchPosition(
      ({ coords }) =>
        setPosition({ state: "shown", at: { lat: coords.latitude, lng: coords.longitude }, accuracyM: coords.accuracy }),
      (error) => {
        stopWatching();
        setPosition({ state: "failed", reason: positionFailure(error.code) });
      },
      { enableHighAccuracy: true, timeout: 30_000 },
    );
  };

  return [position, show];
}
