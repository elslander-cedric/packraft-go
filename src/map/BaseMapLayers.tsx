import type { LatLngBoundsExpression } from "leaflet";
import { useEffect } from "react";
import { TileLayer, useMap, WMSTileLayer } from "react-leaflet";
import type { BaseMapId } from "@/core/settings";
import { baseMap, type Bounds } from "./mapConfig";

const leafletBounds = (bounds: Bounds): LatLngBoundsExpression => [[...bounds[0]], [...bounds[1]]];

/**
 * The chosen base map's sources, stacked bottom to top, each with its own attribution
 * (ADR 0031). The map zooms no further in than the base map goes; switching to one
 * that goes less far zooms out to its max. Imports Leaflet: map components only.
 */
export default function BaseMapLayers({ id }: { id: BaseMapId }) {
  const map = useMap();
  const { maxZoom, sources } = baseMap(id);
  useEffect(() => {
    map.setMaxZoom(maxZoom);
  }, [map, maxZoom]);

  // Keyed by base map: a switch replaces every layer, so each takes its new options.
  return sources.map((source, i) => {
    // Only the options a source sets: Leaflet takes an undefined option over its own default.
    const options = {
      attribution: source.attribution,
      maxZoom,
      maxNativeZoom: source.maxNativeZoom,
      zIndex: i + 1,
      ...(source.minZoom !== undefined && { minZoom: source.minZoom }),
      ...(source.bounds && { bounds: leafletBounds(source.bounds) }),
    };
    return source.kind === "wms" ? (
      <WMSTileLayer key={`${id}-${i}`} url={source.url} params={{ ...source.params }} {...options} />
    ) : (
      <TileLayer
        key={`${id}-${i}`}
        url={source.url}
        {...options}
        {...(source.subdomains && { subdomains: [...source.subdomains] })}
      />
    );
  });
}
