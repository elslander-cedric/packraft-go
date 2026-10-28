import type { BaseMapId } from "@/core/settings";
import { strings } from "@/ui/strings";

export type LatLng = readonly [lat: number, lng: number];

// The only place v1 targets Belgium (ADR 0004): other regions are a config change.
export const initialMapView: { center: LatLng; zoom: number } = {
  center: [50.5, 4.47],
  zoom: 8,
};

/** A box on the map: its south-west and north-east corners. */
export type Bounds = readonly [southWest: LatLng, northEast: LatLng];

/**
 * One source of map tiles in Web Mercator. `maxNativeZoom` is the last zoom it
 * has tiles for: further in, Leaflet enlarges those. A source with `bounds` is
 * never asked for tiles outside them, and one with `minZoom` not below it.
 */
export type TileSource = {
  attribution: string;
  maxNativeZoom: number;
  minZoom?: number;
  bounds?: Bounds;
} & (
  | {
      /** XYZ tiles, or WMTS tiles in the GoogleMapsCompatible set, from a URL template. */
      kind: "tiles";
      url: string;
      subdomains?: readonly string[];
    }
  | {
      /** A WMS, asked for one image per tile. */
      kind: "wms";
      url: string;
      params: {
        layers: string;
        format: string;
        transparent: boolean;
        version: string;
      };
    }
);

/**
 * A base map (GLOSSARY): one choice of what is drawn under the trip, made of
 * one or more sources stacked bottom to top.
 */
export type BaseMap = {
  id: BaseMapId;
  name: string;
  maxZoom: number;
  sources: readonly TileSource[];
};

const openTopoMap: TileSource = {
  kind: "tiles",
  url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  subdomains: ["a", "b", "c"],
  maxNativeZoom: 17,
  attribution: strings.mapAttribution,
};

// Rough boxes around the regions, a little wider than their borders.
const belgium: Bounds = [
  [49.45, 2.5],
  [51.55, 6.45],
];
const flanders: Bounds = [
  [50.67, 2.54],
  [51.51, 5.95],
];
const brussels: Bounds = [
  [50.76, 4.24],
  [50.92, 4.49],
];

/**
 * The base maps (ADR 0031), the default first. The Belgian ones draw OpenTopoMap
 * underneath, so the map is never blank across the border. The only place v1
 * targets Belgium besides the initial view (ADR 0004).
 */
export const baseMaps: readonly BaseMap[] = [
  {
    id: "opentopomap",
    name: strings.baseMaps.opentopomap,
    maxZoom: 17,
    sources: [openTopoMap],
  },
  {
    id: "aerial-be",
    name: strings.baseMaps["aerial-be"],
    maxZoom: 19,
    sources: [
      openTopoMap,
      // Answers tiles outside its range with HTTP 400, hence the bounds.
      {
        kind: "tiles",
        url: "https://geo.api.vlaanderen.be/OMWRGBMRVL/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=omwrgbmrvl&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        maxNativeZoom: 19,
        bounds: flanders,
        attribution: strings.baseMapAttribution.flanders,
      },
      {
        kind: "tiles",
        url: "https://geoservices-urbis.irisnet.be/geowebcache/service/wmts/rest/Ortho/default/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/jpeg",
        maxNativeZoom: 19,
        bounds: brussels,
        attribution: strings.baseMapAttribution.brussels,
      },
      // On top: it is transparent outside Wallonia, so the boxes above never hide it or are hidden by it.
      {
        kind: "wms",
        url: "https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer",
        params: {
          layers: "0",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
        },
        maxNativeZoom: 19,
        attribution: strings.baseMapAttribution.wallonia,
      },
    ],
  },
  {
    id: "ngi-topo",
    name: strings.baseMaps["ngi-topo"],
    maxZoom: 17,
    sources: [
      openTopoMap,
      // CartoWeb.be's Web Mercator set has zooms 7 to 17 only.
      {
        kind: "tiles",
        url: "https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png",
        minZoom: 7,
        maxNativeZoom: 17,
        bounds: belgium,
        attribution: strings.baseMapAttribution.ngi,
      },
    ],
  },
];

/** The base map with this id. */
export const baseMap = (id: BaseMapId): BaseMap => baseMaps.find((map) => map.id === id) ?? baseMaps[0];

/**
 * Lock markers (#57) show from this zoom on. Further out a marker covers a few
 * kilometres of the waters around it, so a click on a river would open a lock.
 */
export const lockMarkersMinZoom = 11;

/**
 * The z-index of each of our Leaflet panes, in one place, so their order reads at a glance.
 * Leaflet's own: tiles 200, overlays (paths) 400, shadows 500, markers 600 (your access
 * points), tooltips 650, popups 700.
 */
export const paneZIndex = {
  /** The access layer's waters, below the trip. */
  access: 350,
  /** Put-ins and take-outs, above the legs (desktop). */
  tripModeChanges: 400,
  /** The trip's points, above the legs, so a leg never covers a point. */
  tripPoints: 401,
  tripCamps: 402,
  /** The phone's leg hit lines: above the drawn trip, below the access-point markers and point hit areas. */
  tripLegHits: 450,
  /** The phone's lock markers: above the leg hit lines, so a tap on a lock on a leg opens the lock. */
  accessLocks: 460,
  /** The phone's point hit areas: above the access-point markers, so a route point there is grabbed first (#120). */
  tripPointHits: 620,
} as const;
