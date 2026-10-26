import { strings } from "@/ui/strings";

export type LatLng = readonly [lat: number, lng: number];

// The only place v1 targets Belgium (ADR 0004): other regions are a config change.
export const initialMapView: { center: LatLng; zoom: number } = {
  center: [50.5, 4.47],
  zoom: 8,
};

export const baseLayer = {
  url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  subdomains: ["a", "b", "c"],
  maxZoom: 17,
  attribution: strings.mapAttribution,
} as const;

/**
 * Lock markers (#57) show from this zoom on. Further out a marker covers a few
 * kilometres of the waters around it, so a click on a river would open a lock.
 */
export const lockMarkersMinZoom = 11;

/**
 * The z-index of each of our Leaflet panes, in one place, so their order reads at a glance.
 * Leaflet's own: tiles 200, overlays (paths) 400, shadows 500, markers 600 (your access
 * points), tooltips 650, popups 700.
 */
export const paneZIndex = {
  /** The access layer's waters, below the trip. */
  access: 350,
  /** Put-ins and take-outs, above the legs (desktop). */
  tripModeChanges: 400,
  /** The trip's points, above the legs, so a leg never covers a point. */
  tripPoints: 401,
  tripCamps: 402,
  /** The phone's leg hit lines: above the drawn trip, below the access-point markers and point hit areas. */
  tripLegHits: 450,
  /** The phone's lock markers: above the leg hit lines, so a tap on a lock on a leg opens the lock. */
  accessLocks: 460,
  /** The phone's point hit areas: above the access-point markers, so a route point there is grabbed first (#120). */
  tripPointHits: 620,
} as const;
