import { describe, expect, it } from "vitest";
import { baseMapIds, defaultSettings } from "@/core/settings";
import { strings } from "@/ui/strings";
import { baseMap, baseMaps, initialMapView, type TileSource } from "./mapConfig";

// Rough bounding box of Belgium, independent of the app's own numbers.
const BELGIUM = { south: 49.49, north: 51.51, west: 2.54, east: 6.41 };

describe("initial map view", () => {
  it("is centred on Belgium", () => {
    const [lat, lng] = initialMapView.center;
    expect(lat).toBeGreaterThan(BELGIUM.south);
    expect(lat).toBeLessThan(BELGIUM.north);
    expect(lng).toBeGreaterThan(BELGIUM.west);
    expect(lng).toBeLessThan(BELGIUM.east);
  });

  it("is zoomed out far enough to show the whole country", () => {
    expect(initialMapView.zoom).toBeGreaterThanOrEqual(6);
    expect(initialMapView.zoom).toBeLessThanOrEqual(9);
  });
});

const urls = (sources: readonly TileSource[]) => sources.map((source) => source.url);

/** True when the box lies inside `outer`. */
const within = (box: TileSource["bounds"], outer: typeof BELGIUM) =>
  box !== undefined &&
  box[0][0] >= outer.south &&
  box[1][0] <= outer.north &&
  box[0][1] >= outer.west &&
  box[1][1] <= outer.east;

describe("base maps", () => {
  it("offer OpenTopoMap, aerial photos and NGI topo, one per setting, OpenTopoMap first", () => {
    expect(baseMaps.map((map) => map.id)).toEqual([...baseMapIds]);
    expect(baseMaps[0].id).toBe(defaultSettings.baseMap);
  });

  it("each have their name from the strings", () => {
    for (const map of baseMaps) expect(map.name).toBe(strings.baseMaps[map.id]);
  });

  it("are found by id", () => {
    for (const id of baseMapIds) expect(baseMap(id).id).toBe(id);
  });

  describe("OpenTopoMap", () => {
    const map = baseMap("opentopomap");

    it("is OpenTopoMap tiles alone, up to zoom 17", () => {
      expect(map.maxZoom).toBe(17);
      expect(map.sources).toHaveLength(1);
      expect(map.sources[0]).toMatchObject({
        kind: "tiles",
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c"],
        maxNativeZoom: 17,
      });
    });

    it("credits OpenStreetMap, OpenTopoMap and BRouter", () => {
      expect(map.sources[0].attribution).toContain("OpenStreetMap");
      expect(map.sources[0].attribution).toContain("OpenTopoMap");
      expect(map.sources[0].attribution).toContain("BRouter");
    });
  });

  describe.each(["aerial-be", "ngi-topo"] as const)("%s", (id) => {
    const map = baseMap(id);

    it("draws OpenTopoMap underneath, so nothing is blank across the border", () => {
      expect(map.sources[0]).toEqual(baseMap("opentopomap").sources[0]);
    });

    it("gives every source its own attribution", () => {
      for (const source of map.sources) expect(source.attribution).not.toBe("");
      expect(new Set(map.sources.map((source) => source.attribution)).size).toBe(map.sources.length);
    });

    it("never asks a source for tiles past its own max zoom", () => {
      for (const source of map.sources) expect(source.maxNativeZoom).toBeLessThanOrEqual(map.maxZoom);
    });
  });

  describe("aerial photos (Belgium)", () => {
    const map = baseMap("aerial-be");
    const [, ...regions] = map.sources;

    it("goes to zoom 19", () => {
      expect(map.maxZoom).toBe(19);
    });

    it("stacks the Flemish, Brussels and Walloon photos over OpenTopoMap", () => {
      expect(urls(regions)).toEqual([
        "https://geo.api.vlaanderen.be/OMWRGBMRVL/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=omwrgbmrvl&STYLE=&FORMAT=image/png&TILEMATRIXSET=GoogleMapsVL&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        "https://geoservices-urbis.irisnet.be/geowebcache/service/wmts/rest/Ortho/default/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/jpeg",
        "https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer",
      ]);
    });

    it("asks the Walloon WMS for transparent PNGs of layer 0 (WMS 1.3.0)", () => {
      expect(regions[2]).toMatchObject({
        kind: "wms",
        params: {
          layers: "0",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
        },
      });
    });

    it("keeps Flanders and Brussels inside their bounds (out-of-range Flemish tiles are errors)", () => {
      const [flanders, brussels] = regions;
      expect(within(flanders.bounds, BELGIUM)).toBe(true);
      expect(
        within(brussels.bounds, {
          south: 50.7,
          north: 51,
          west: 4.2,
          east: 4.55,
        }),
      ).toBe(true);
    });

    it("credits each region", () => {
      expect(regions.map((source) => source.attribution)).toEqual([
        strings.baseMapAttribution.flanders,
        strings.baseMapAttribution.brussels,
        strings.baseMapAttribution.wallonia,
      ]);
      expect(strings.baseMapAttribution.flanders).toContain("Bron: Luchtopnamen Digitaal Vlaanderen");
      expect(strings.baseMapAttribution.wallonia).toContain("SPW");
      expect(strings.baseMapAttribution.brussels).toContain("paradigm.brussels");
    });
  });

  describe("NGI topo (Belgium)", () => {
    const map = baseMap("ngi-topo");
    const [, ngi] = map.sources;

    it("is CartoWeb.be topo over OpenTopoMap, zoom 7 to 17", () => {
      expect(map.maxZoom).toBe(17);
      expect(map.sources).toHaveLength(2);
      expect(ngi).toMatchObject({
        kind: "tiles",
        url: "https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png",
        minZoom: 7,
        maxNativeZoom: 17,
      });
      expect(
        within(ngi.bounds, {
          ...BELGIUM,
          south: 49.4,
          north: 51.6,
          west: 2.4,
          east: 6.5,
        }),
      ).toBe(true);
    });

    it("credits NGI/IGN and TomTom", () => {
      expect(ngi.attribution).toBe(strings.baseMapAttribution.ngi);
      expect(ngi.attribution).toContain("NGI");
      expect(ngi.attribution).toContain("TomTom");
    });
  });
});
