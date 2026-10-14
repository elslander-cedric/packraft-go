"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { accessFeatures } from "@/core/access";
import { AccessDetailPanel, AccessLayerControls, LockDetailPanel } from "@/ui/AccessPanel";
import { strings } from "@/ui/strings";
import { localToday, useAccessRules, useBuiltInLocks } from "@/ui/useAccessRules";
import type { TripMapProps } from "./TripMap";

// Leaflet touches `window` on import, so the map is never rendered on the server.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="map-loading">{strings.mapLoading}</div>,
});

export default function ClientTripMap(props: Omit<TripMapProps, "access">) {
  const [accessOn, setAccessOn] = useState(false);
  const [selectedWater, setSelectedWater] = useState<string | null>(null);
  const rules = useAccessRules(accessOn);
  const locks = useBuiltInLocks(accessOn);
  const features = useMemo(() => (rules ? accessFeatures(rules, { date: localToday(), today: localToday() }) : []), [rules]);
  const selected = accessOn ? features.find((f) => f.record.id === selectedWater) : undefined;
  const selectedLock = accessOn ? locks?.find((l) => l.id === selectedWater) : undefined;
  const toggleAccess = (on: boolean) => {
    setAccessOn(on);
    if (!on) setSelectedWater(null);
  };

  return (
    <section className="map" aria-label={strings.mapLabel}>
      <TripMap
        {...props}
        access={accessOn && rules ? { features, locks: locks ?? [], selectedId: selectedWater, onSelect: setSelectedWater } : null}
      />
      <div className="access-overlay">
        <AccessLayerControls on={accessOn} onToggle={toggleAccess} />
        {selected && <AccessDetailPanel feature={selected} onClose={() => setSelectedWater(null)} />}
        {selectedLock && <LockDetailPanel lock={selectedLock} onClose={() => setSelectedWater(null)} />}
      </div>
    </section>
  );
}
