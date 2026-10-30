"use client";

// The shown search result (#173, ADR 0030): a pin with its name, where the map
// moves when a result is picked. Imports Leaflet: only used inside TripMap.
import { divIcon, latLngBounds } from "leaflet";
import { useEffect } from "react";
import { Marker, Tooltip, useMap } from "react-leaflet";
import type { SearchResult } from "@/core/placeSearch";
import { icons } from "@/ui/icons/icons";
import { iconSvg } from "@/ui/icons/iconSvg";
import "./SearchResultLayer.css";

/** Never closer than this for a result: a dam or a house still shows its surroundings. */
export const MAX_RESULT_ZOOM = 15;

const pin = divIcon({
  className: "search-result-marker",
  html: `<span class="search-result-pin">${iconSvg(icons.searchResult)}</span>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  tooltipAnchor: [0, -30],
});

/** How many pixels of the map are hidden at its top, right and bottom (the pill, the side panel or the sheet; #174). */
export type MapCover = { top: number; right: number; bottom: number };

const UNCOVERED: MapCover = { top: 0, right: 0, bottom: 0 };

/**
 * Moves the map to `result` whenever a new one is shown (a new object each
 * pick), into the part `cover` leaves free, and draws its pin. Not interactive:
 * clicks and drags reach the map, so a point can be added right on it. Never saved.
 */
export default function SearchResultLayer({ result, cover }: { result: SearchResult; cover?: () => MapCover }) {
  const map = useMap();
  useEffect(() => {
    const { top, right, bottom } = cover?.() ?? UNCOVERED;
    if (result.box) {
      const { south, west, north, east } = result.box;
      map.fitBounds(
        latLngBounds([
          [south, west],
          [north, east],
        ]),
        { maxZoom: MAX_RESULT_ZOOM, paddingTopLeft: [0, top], paddingBottomRight: [right, bottom] },
      );
    } else {
      // The result at the centre of the free part.
      const at = map.project(result.at, MAX_RESULT_ZOOM).add([right / 2, (bottom - top) / 2]);
      map.setView(map.unproject(at, MAX_RESULT_ZOOM), MAX_RESULT_ZOOM);
    }
    // Only a new result moves the map: the cover is read then, not followed as the sheet moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, result]);

  return (
    <Marker position={result.at} icon={pin} interactive={false} keyboard={false}>
      <Tooltip permanent direction="top" className="search-result-label">
        {result.label}
      </Tooltip>
    </Marker>
  );
}
