import { useEffect, useRef, useState } from "react";
import { positionFailure, type MyPosition } from "./position";

/**
 * Your position from the browser's Geolocation API, only once asked for:
 * the browser asks for permission on the first request, never on load.
 * Once shown, the position follows you until the screen closes.
 * `show` can be given a callback, called once with the first result: a fix
 * (`shown`) or a failure ("mark access point here" waits for it).
 */
export function usePosition(): [MyPosition, (onFirst?: (first: MyPosition) => void) => void] {
  const [position, setPosition] = useState<MyPosition>({ state: "off" });
  const watch = useRef<number | null>(null);

  const stopWatching = () => {
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
    }
    watch.current = null;
  };
  useEffect(() => stopWatching, []);

  const showPosition = (onFirst?: (first: MyPosition) => void) => {
    let waiting = onFirst;
    const reportPosition = (next: MyPosition) => {
      setPosition(next);
      const callback = waiting;
      waiting = undefined;
      callback?.(next);
    };
    if (!("geolocation" in navigator)) {
      reportPosition({ state: "failed", reason: "unsupported" });
      return;
    }
    stopWatching();
    setPosition({ state: "locating" });
    watch.current = navigator.geolocation.watchPosition(
      ({ coords }) =>
        reportPosition({
          state: "shown",
          at: { lat: coords.latitude, lng: coords.longitude },
          accuracyM: coords.accuracy,
        }),
      (error) => {
        stopWatching();
        reportPosition({ state: "failed", reason: positionFailure(error.code) });
      },
      { enableHighAccuracy: true, timeout: 30_000 },
    );
  };

  return [position, showPosition];
}
