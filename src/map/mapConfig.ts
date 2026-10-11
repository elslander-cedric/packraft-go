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
