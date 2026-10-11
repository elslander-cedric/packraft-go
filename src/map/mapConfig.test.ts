import { describe, expect, it } from "vitest";
import { baseLayer, initialMapView } from "./mapConfig";

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

describe("base layer", () => {
  it("uses OpenTopoMap tiles", () => {
    expect(baseLayer.url).toContain("tile.opentopomap.org");
  });

  it("credits OpenStreetMap, OpenTopoMap and BRouter", () => {
    expect(baseLayer.attribution).toContain("OpenStreetMap");
    expect(baseLayer.attribution).toContain("OpenTopoMap");
    expect(baseLayer.attribution).toContain("BRouter");
  });
});
