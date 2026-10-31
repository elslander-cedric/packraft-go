import { divIcon } from "leaflet";
import type { LegMode, ModeChange } from "@/core/trip";
import { icons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import { strings } from "@/ui/strings";

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.

// Hike legs are thin and earth-coloured, paddle legs wider and water-blue, so the mix shows at a glance.
export const legStyle: Record<LegMode, { color: string; weight: number }> = {
  hike: { color: "#b5491b", weight: 4 },
  paddle: { color: "#1b6fb5", weight: 6 },
};

// A white casing under each leg sets it apart from the overlays' trails and the access
// layer's waters, which use colours close to the legs' own (prototype/layer-colours).
export const legCasingStyle: Record<LegMode, { color: string; weight: number; opacity: number }> = {
  hike: { color: "#fff", weight: legStyle.hike.weight + 5, opacity: 1 },
  paddle: { color: "#fff", weight: legStyle.paddle.weight + 5, opacity: 1 },
};

export const modeChangeStyle: Record<ModeChange["kind"], { color: string }> = {
  "put-in": { color: "#1a8f3a" },
  "take-out": { color: "#7a3fb5" },
};

// A green triangle with a white tent in it (ADR 0028), drawn below and to the right of
// its point, clear of the point and of the put-in/take-out labels above it.
const campTentPlacement = { x: 6, y: 8.5, width: 8, height: 7.5 };
export const campIcon = divIcon({
  className: "camp-marker",
  html:
    `<svg role="img" aria-label=${JSON.stringify(strings.campMarker)} viewBox="0 0 20 18" width="20" height="18">` +
    '<path d="M10 1 L19 17 H1 Z" fill="#2e6b30" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
    `<g color="#fff">${iconSvg(icons.camp, campTentPlacement)}</g></svg>`,
  iconSize: [20, 18],
  iconAnchor: [-7, -5],
});
