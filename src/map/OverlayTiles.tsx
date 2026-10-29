import { Pane, TileLayer } from "react-leaflet";
import type { OverlayId } from "@/core/settings";
import { baseMaps, overlays, paneZIndex } from "./mapConfig";

// As far in as any base map goes: the map itself stops at its base map's max, and the
// layers never need replacing (and their tiles fetching again) when the base map changes.
const maxZoom = Math.max(...baseMaps.map((map) => map.maxZoom));

/**
 * The switched-on overlays' tiles (ADR 0032), in their own pane above the base map and
 * below the access layer and the trip, at full opacity, with their attributions. They are
 * drawn as far in as the base map goes, enlarged past their own last zoom. Imports
 * Leaflet: map components only.
 */
export default function OverlayTiles({ ids }: { ids: readonly OverlayId[] }) {
  return (
    <Pane name="overlay-tiles" style={{ zIndex: paneZIndex.overlays }}>
      {overlays
        .filter((overlay) => ids.includes(overlay.id))
        .map(({ id, source }) => (
          <TileLayer
            key={id}
            url={source.url}
            attribution={source.attribution}
            maxZoom={maxZoom}
            maxNativeZoom={source.maxNativeZoom}
          />
        ))}
    </Pane>
  );
}
