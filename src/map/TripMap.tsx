"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import { baseLayer, initialMapView } from "./mapConfig";

// Imports Leaflet, which needs `window`: only load this through ClientTripMap.
export default function TripMap() {
  return (
    <MapContainer
      center={[...initialMapView.center]}
      zoom={initialMapView.zoom}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url={baseLayer.url}
        subdomains={[...baseLayer.subdomains]}
        maxZoom={baseLayer.maxZoom}
        attribution={baseLayer.attribution}
      />
    </MapContainer>
  );
}
