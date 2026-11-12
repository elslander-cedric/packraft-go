import { latLngBounds } from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { SearchArea } from "@/core/placeSearch";
import type { LatLng, Trip } from "@/core/trip";
import type { MapCover } from "./SearchResultLayer";

// Where the map looks: the fit when it opens, your position when it is first shown, and a place
// the planner asks to show. None of these draw anything.

/**
 * A place to show in the part of the map the sheet leaves free (it covers
 * `coveredBelow` of the map's height), or the side panel (it covers
 * `coveredRight` of the map's width, #126): a spot, zoomed in and centred, or an
 * area (such as a leg, #121, or a day's route, #123), fitted whole.
 */
export type MapFocus = ({ at: LatLng } | { area: readonly LatLng[] }) & { coveredBelow: number; coveredRight?: number };

/** Tells `onChange` the visible map when it loads and after every move. */
export function MapAreaReporter({ onChange }: { onChange: (area: SearchArea) => void }) {
  const map = useMap();
  const report = () => {
    const bounds = map.getBounds();
    onChange({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() });
  };
  useMapEvents({ moveend: report });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(report, [map]);
  return null;
}

/** Zoom used to show your position: close enough to see the river bank. */
const POSITION_ZOOM = 15;

/** Fits the trip on screen when the map opens, and centres on your position when it is first shown. */
export function OpeningView({
  trip,
  position,
  cover,
}: {
  trip: Trip;
  position: { at: LatLng } | null;
  cover?: () => MapCover;
}) {
  const map = useMap();
  // The number of points the map last saw; null until it opens.
  const shown = useRef<number | null>(null);
  useEffect(() => {
    // Fits the trip the map opens with, and a trip opened over an empty one (it arrives with
    // several points at once). Otherwise the map is the user's to move: the first point drawn
    // on an empty trip doesn't move it.
    const before = shown.current;
    shown.current = trip.points.length;
    const opened = before === null ? trip.points.length > 0 : before === 0 && trip.points.length > 1;
    if (!opened) {
      return;
    }
    // Into the part of the map the top row, the sheet or the side panel leave free.
    const { top, right, bottom } = cover?.() ?? { top: 0, right: 0, bottom: 0 };
    map.fitBounds(latLngBounds(trip.points.map((point) => [point.lat, point.lng])), {
      paddingTopLeft: [24, top + 24],
      paddingBottomRight: [right + 24, bottom + 24],
    });
  }, [map, trip]);
  const centred = useRef(false);
  useEffect(() => {
    if (!position) {
      centred.current = false;
      return;
    }
    if (centred.current) {
      return;
    }
    centred.current = true;
    map.setView(position.at, Math.max(map.getZoom(), POSITION_ZOOM));
  }, [map, position]);
  return null;
}

/** Margin around a fitted stretch, in pixels. */
const FOCUS_PADDING = 24;

/**
 * Shows `focus` above the sheet, whenever a new one is given. Leaflet ignores a new view while
 * a zoom animation runs, so a focus given during one (a second row or day tapped soon after the
 * first) waits for it to end.
 */
export function Focus({ focus }: { focus: MapFocus }) {
  const map = useMap();
  const zooming = useRef(false);
  useEffect(() => {
    const start = () => {
      zooming.current = true;
    };
    const end = () => {
      zooming.current = false;
    };
    map.on("zoomanim", start);
    map.on("zoomend", end);
    return () => {
      map.off("zoomanim", start);
      map.off("zoomend", end);
    };
  }, [map]);
  useEffect(() => {
    const show = () => {
      if ("area" in focus) {
        if (focus.area.length === 0) {
          return;
        }
        const below = map.getSize().y * focus.coveredBelow;
        const right = map.getSize().x * (focus.coveredRight ?? 0);
        map.fitBounds(latLngBounds(focus.area.map((point) => [point.lat, point.lng])), {
          paddingTopLeft: [FOCUS_PADDING, FOCUS_PADDING],
          paddingBottomRight: [right + FOCUS_PADDING, below + FOCUS_PADDING],
        });
        return;
      }
      const zoom = Math.max(map.getZoom(), POSITION_ZOOM);
      const shiftX = (map.getSize().x * (focus.coveredRight ?? 0)) / 2;
      const shiftY = (map.getSize().y * focus.coveredBelow) / 2;
      map.setView(map.unproject(map.project(focus.at, zoom).add([shiftX, shiftY]), zoom), zoom);
    };
    if (!zooming.current) {
      show();
      return;
    }
    map.once("zoomend", show);
    return () => {
      map.off("zoomend", show);
    };
  }, [map, focus]);
  return null;
}
