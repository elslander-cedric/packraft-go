"use client";

// PROTOTYPE (place search UI, #169): throwaway, never merged. Imports Leaflet: only used
// inside TripMap / PhoneMap.

import { divIcon, latLngBounds, type Marker as LeafletMarker } from "leaflet";
import { useEffect, useRef } from "react";
import { Marker, Popup, Tooltip, useMap } from "react-leaflet";
import { icons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import type { PrototypeResult } from "./stub";

/** The search result to draw, and how its label and Clear look in this variant. */
export type SearchResultLayerProps = {
  result: PrototypeResult;
  /** Changes every time a result is picked, so the map moves again. */
  seq: number;
  /** "tooltip": a permanent label, the marker lets taps through. "popup": tap the marker for its name and Clear. */
  label: "tooltip" | "popup";
  onClear: () => void;
  /** How much of the map's height is covered below (the phone's sheet), 0..1. */
  coveredBelow?: number;
};

/** Never zoom in closer than this for a result: a dam or a house still shows its surroundings. */
const MAX_RESULT_ZOOM = 15;

const pin = divIcon({
  className: "search-result-marker",
  html: `<span class="search-result-pin">${iconSvg(icons.searchResult)}</span>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -30],
  tooltipAnchor: [0, -30],
});

export default function SearchResultLayer({ result, seq, label, onClear, coveredBelow = 0 }: SearchResultLayerProps) {
  const map = useMap();
  const marker = useRef<LeafletMarker>(null);
  useEffect(() => {
    const below = map.getSize().y * coveredBelow;
    if (result.box) {
      const [s, n, w, e] = result.box;
      map.fitBounds(
        latLngBounds([
          [s, w],
          [n, e],
        ]),
        { maxZoom: MAX_RESULT_ZOOM, paddingTopLeft: [24, 80], paddingBottomRight: [24, below + 24] },
      );
    } else {
      const zoom = MAX_RESULT_ZOOM;
      map.setView(map.unproject(map.project(result.at, zoom).add([0, below / 2]), zoom), zoom);
    }
    if (label === "popup") setTimeout(() => marker.current?.openPopup(), 400);
    // seq: a new pick moves the map again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, seq]);

  return (
    <Marker ref={marker} position={result.at} icon={pin} interactive={label === "popup"} keyboard={false}>
      {label === "tooltip" ? (
        <Tooltip permanent direction="top" className="search-result-label">
          {result.label}
        </Tooltip>
      ) : (
        <Popup className="search-result-popup" closeButton={false} autoPan={false}>
          <strong>{result.label}</strong>
          {result.detail && <div className="search-result-popup-detail">{result.detail}</div>}
          <button type="button" className="button search-result-popup-clear" onClick={onClear}>
            Clear search result
          </button>
        </Popup>
      )}
    </Marker>
  );
}
