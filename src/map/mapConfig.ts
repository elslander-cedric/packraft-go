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
