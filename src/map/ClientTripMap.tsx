"use client";

import dynamic from "next/dynamic";
import { AccessDetailPanel, AccessLayerControls, LockDetailPanel } from "@/ui/AccessPanel";
import { strings } from "@/ui/strings";
import { useAccessLayer } from "@/ui/useAccessLayer";
import type { TripMapProps } from "./TripMap";

// Leaflet touches `window` on import, so the map is never rendered on the server.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="map-loading">{strings.mapLoading}</div>,
});

export default function ClientTripMap(props: Omit<TripMapProps, "access">) {
  const layer = useAccessLayer(props.trip);
  const close = () => layer.select(null);

  return (
    <section className="map" aria-label={strings.mapLabel}>
      <TripMap
        {...props}
        access={layer.shown && { ...layer.shown, selectedId: layer.selectedId, onSelect: layer.select }}
      />
      <div className="access-overlay">
        <AccessLayerControls on={layer.on} onToggle={layer.setOn} dateSelector={layer.dateSelector} />
        {layer.selectedWater && <AccessDetailPanel feature={layer.selectedWater} date={layer.date} onClose={close} />}
        {layer.selectedLock && <LockDetailPanel lock={layer.selectedLock} onClose={close} />}
      </div>
    </section>
  );
}
