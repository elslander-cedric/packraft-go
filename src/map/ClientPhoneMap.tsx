"use client";

import dynamic from "next/dynamic";
import { strings } from "@/ui/strings";
import type { PhoneMapProps } from "./PhoneMap";

// Leaflet touches `window` on import, so the map is never rendered on the server.
const PhoneMap = dynamic(() => import("./PhoneMap"), {
  ssr: false,
  loading: () => <div className="map-loading">{strings.mapLoading}</div>,
});

export default function ClientPhoneMap(props: PhoneMapProps) {
  return (
    <section className="map phone-map" aria-label={strings.mapLabel}>
      <PhoneMap {...props} />
    </section>
  );
}
