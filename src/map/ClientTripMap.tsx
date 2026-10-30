"use client";

import dynamic from "next/dynamic";
import { strings } from "@/ui/strings";
import type { TripMapProps } from "./TripMap";

// Leaflet touches `window` on import, so the map is never rendered on the server.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="map-loading">{strings.mapLoading}</div>,
});

export default function ClientTripMap(props: TripMapProps) {
  return (
    <section className="map planner-map" aria-label={strings.mapLabel}>
      <TripMap {...props} />
    </section>
  );
}
