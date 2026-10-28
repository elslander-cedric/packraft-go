import { Control, DomEvent, DomUtil, type ControlPosition } from "leaflet";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";

/**
 * Draws `children` as a Leaflet control in a corner of the map, so Leaflet stacks it
 * with its own controls (in the bottom corners, above the attribution). Clicks and
 * scrolls on it never reach the map. Imports Leaflet: map components only.
 */
export default function MapControl({ position, children }: { position: ControlPosition; children: ReactNode }) {
  const map = useMap();
  const [element] = useState(() => {
    const created = DomUtil.create("div", "leaflet-control");
    DomEvent.disableClickPropagation(created);
    DomEvent.disableScrollPropagation(created);
    return created;
  });
  useEffect(() => {
    const control = new Control({ position });
    control.onAdd = () => element;
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, position, element]);
  return createPortal(children, element);
}
