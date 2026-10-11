"use client";

import dynamic from "next/dynamic";
import { strings } from "@/ui/strings";

// Leaflet touches `window` on import, so the map is never rendered on the server.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="map-loading">{strings.mapLoading}</div>,
});

export default function ClientTripMap() {
  return (
    <section className="map" aria-label={strings.mapLabel}>
      <TripMap />
    </section>
  );
}
