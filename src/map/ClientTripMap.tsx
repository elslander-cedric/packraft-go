"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { accessFeatures, type AccessRules } from "@/core/access";
import { AccessDetailPanel, AccessLayerControls } from "@/ui/AccessPanel";
import { strings } from "@/ui/strings";
import type { TripMapProps } from "./TripMap";

// Leaflet touches `window` on import, so the map is never rendered on the server.
const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="map-loading">{strings.mapLoading}</div>,
});

/** Today's local date, YYYY-MM-DD. */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * The built-in access rules, loaded the first time the access layer is
 * switched on, so the page itself stays light.
 */
function useAccessRules(wanted: boolean): AccessRules | null {
  const [rules, setRules] = useState<AccessRules | null>(null);
  useEffect(() => {
    if (!wanted || rules) return;
    let cancelled = false;
    void import("@/access/builtInRules").then(({ builtInAccessRules }) => {
      if (!cancelled) setRules(builtInAccessRules);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, rules]);
  return rules;
}

export default function ClientTripMap(props: Omit<TripMapProps, "access">) {
  const [accessOn, setAccessOn] = useState(false);
  const [selectedWater, setSelectedWater] = useState<string | null>(null);
  const rules = useAccessRules(accessOn);
  const features = useMemo(() => (rules ? accessFeatures(rules, { date: today() }) : []), [rules]);
  const selected = accessOn ? features.find((f) => f.record.id === selectedWater) : undefined;
  const toggleAccess = (on: boolean) => {
    setAccessOn(on);
    if (!on) setSelectedWater(null);
  };

  return (
    <section className="map" aria-label={strings.mapLabel}>
      <TripMap
        {...props}
        access={accessOn && rules ? { features, selectedId: selectedWater, onSelect: setSelectedWater } : null}
      />
      <div className="access-overlay">
        <AccessLayerControls on={accessOn} onToggle={toggleAccess} />
        {selected && <AccessDetailPanel feature={selected} onClose={() => setSelectedWater(null)} />}
      </div>
    </section>
  );
}
