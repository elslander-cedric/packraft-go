// Your GPS position on the phone (#56, ADR 0023): what is known about it, and
// what to tell the user. Browser access lives in usePosition.ts.
import type { LatLng } from "@/core/trip";
import { strings } from "../strings";

export type PositionFailure = "denied" | "unavailable" | "timeout" | "unsupported";

/**
 * Where your position is: not asked for yet, being found, shown (with the
 * browser's accuracy radius in metres), or failed with a reason.
 */
export type MyPosition =
  | { readonly state: "off" }
  | { readonly state: "locating" }
  | { readonly state: "shown"; readonly at: LatLng; readonly accuracyM: number }
  | { readonly state: "failed"; readonly reason: PositionFailure };

/** The reason for a Geolocation API error code (GeolocationPositionError.code). */
export function positionFailure(code: number): PositionFailure {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

const failureText: Record<PositionFailure, string> = {
  denied: strings.phone.positionDenied,
  unavailable: strings.phone.positionUnavailable,
  timeout: strings.phone.positionTimeout,
  unsupported: strings.phone.positionUnsupported,
};

/** What to show about your position: a status line, an alert for failures, or nothing. */
export function positionMessage(position: MyPosition): { kind: "status" | "alert"; text: string } | null {
  switch (position.state) {
    case "off":
      return null;
    case "locating":
      return { kind: "status", text: strings.phone.positionLocating };
    case "shown":
      return {
        kind: "status",
        text: strings.phone.positionAccuracy(`${Math.round(position.accuracyM)} ${strings.metreUnit}`),
      };
    case "failed":
      return { kind: "alert", text: failureText[position.reason] };
  }
}
