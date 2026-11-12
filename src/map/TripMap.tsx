"use client";

import { Circle, CircleMarker, MapContainer } from "react-leaflet";
import type { SearchArea, SearchResult } from "@/core/placeSearch";
import type { BaseMapId, OverlayId } from "@/core/settings";
import type { LatLng, Trip } from "@/core/trip";
import AccessLayer, { type AccessLayerProps } from "./AccessLayer";
import AccessPointLayer, { type AccessPointLayerProps } from "./AccessPointLayer";
import BaseMapTiles from "./BaseMapTiles";
import { Focus, MapAreaReporter, OpeningView, type MapFocus } from "./MapCamera";
import { initialMapView } from "./mapConfig";
import OverlayTiles from "./OverlayTiles";
import SearchResultLayer, { type MapCover } from "./SearchResultLayer";
import { Taps } from "./Taps";
import { TripLayers } from "./TripLayers";

export type { MapFocus };

export type TripMapProps = {
  /** The base map drawn under everything (ADR 0031), chosen in the Map menu. */
  baseMap: BaseMapId;
  /** The switched-on overlays (ADR 0032), drawn over the base map. */
  overlays: readonly OverlayId[];
  trip: Trip;
  /** A tap on the map (not a double tap, not the end of a pinch, not on a point). */
  onMapTap: (at: LatLng) => void;
  /** Index of the selected point, if any. */
  selectedPoint: number | null;
  /** A tap on a point (#120). */
  onPointTap: (index: number) => void;
  /** A point was pressed, dragged and let go at `to` (#120). */
  onPointDrop: (index: number, to: LatLng) => void;
  /** A finger held still on a leg for 0.4 s, or a right-click on it, at `at` (#122). */
  onLegHold: (leg: number, at: LatLng) => void;
  /** The selected leg (#230), marked on the map, or null. */
  selectedLeg: number | null;
  /** A tap on a leg (#230); it is not a tap on the map. */
  onLegTap: (leg: number) => void;
  /**
   * The trip is drawn but can't be touched (access point editing, ADR 0036, #227): its points and
   * legs have no hit areas, so a press reaches your access points or the map beneath.
   */
  frozen?: boolean;
  /** Your position and the browser's accuracy radius in metres, once shown. */
  position: { at: LatLng; accuracyM: number } | null;
  /** Your access points: while editable, tap one to select it, drag it to correct it (#63); otherwise inert (#226). */
  accessPoints?: AccessPointLayerProps;
  /** A place to show (a new object shows it again). */
  focus?: MapFocus | null;
  /** The access layer, while it is switched on (#125): hold a water or tap a lock for its details. */
  access?: AccessLayerProps | null;
  /** The shown place search result (#174): the map moves to it, into the part `searchCover` leaves free, and pins it. */
  searchResult?: SearchResult | null;
  /** What hides the map (the top row, the sheet or the side panel); a fitted trip and a search result stay clear of it. */
  searchCover?: () => MapCover;
  /** The visible map, when it loads and after every move (place search ranks places in it). */
  onAreaChange?: (area: SearchArea) => void;
};

const positionStyle = { color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 };
const accuracyStyle = { color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12 };

/**
 * The planner's map (ADR 0026): the trip, the overlays, the access layer, your access points, your position
 * and the shown place search result.
 * Pinch zoom is on and double-tap zoom is off, because the first tap of a
 * double tap would add a point. Imports Leaflet, which needs `window`: only load
 * this through ClientTripMap.
 */
export default function TripMap({
  baseMap,
  overlays,
  trip,
  onMapTap,
  selectedPoint,
  onPointTap,
  onPointDrop,
  onLegHold,
  selectedLeg,
  onLegTap,
  frozen,
  position,
  accessPoints,
  focus,
  access,
  searchResult,
  searchCover,
  onAreaChange,
}: TripMapProps) {
  return (
    <MapContainer
      center={[...initialMapView.center]}
      zoom={initialMapView.zoom}
      style={{ height: "100%", width: "100%" }}
      doubleClickZoom={false}
      touchZoom
      zoomControl={false}
    >
      <BaseMapTiles id={baseMap} />
      <OverlayTiles ids={overlays} />
      {access && <AccessLayer {...access} />}
      <OpeningView trip={trip} position={position} cover={searchCover} />
      {focus && <Focus focus={focus} />}
      <Taps onTap={onMapTap} onLegTap={onLegTap} />
      <TripLayers
        trip={trip}
        selectedPoint={selectedPoint}
        onPointTap={onPointTap}
        onPointDrop={onPointDrop}
        onLegHold={onLegHold}
        selectedLeg={selectedLeg}
        frozen={frozen}
      />
      {accessPoints && <AccessPointLayer {...accessPoints} />}
      {searchResult && <SearchResultLayer result={searchResult} cover={searchCover} />}
      {onAreaChange && <MapAreaReporter onChange={onAreaChange} />}
      {position && (
        <>
          <Circle
            center={position.at}
            radius={position.accuracyM}
            className="my-position-accuracy"
            interactive={false}
            pathOptions={accuracyStyle}
          />
          <CircleMarker
            center={position.at}
            radius={8}
            className="my-position"
            interactive={false}
            pathOptions={positionStyle}
          />
        </>
      )}
    </MapContainer>
  );
}
