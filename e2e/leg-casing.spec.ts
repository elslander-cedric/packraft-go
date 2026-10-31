// Legs stand out from the map's layers: each leg is drawn on a white casing, and the legs sit
// above the access layer's waters, which used to paint over a paddle leg on the same water
// (prototype/layer-colours). Checked on a desktop-sized window and a phone with a paddle leg routed
// along the Ghent–Terneuzen canal, which the built-in Flemish data draws as a water.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { toggleAccessLayer } from "./support/mapMenu";
import { serveOffline } from "./support/offline";
import type { Pixel } from "./support/touch";

/** Along the Ghent–Terneuzen canal, from the built-in data's geometry. */
const canal = [
  { lat: 51.08505, lng: 3.72577 },
  { lat: 51.08631, lng: 3.72596 },
  { lat: 51.09192, lng: 3.72955 },
];
/** A short hike to the put-in, west of the canal. */
const start = { lat: 51.085, lng: 3.715 };

const routed = (points: { lat: number; lng: number }[]) => ({
  status: "routed",
  geometry: points.map((p) => ({ ...p, elevation: 5 })),
});
const save = {
  format: "packraft-go-trip",
  version: 1,
  trip: {
    name: "Canal trip",
    points: [start, canal[0], canal[canal.length - 1]],
    legs: [
      { mode: "hike", route: routed([start, canal[0]]) },
      { mode: "paddle", route: routed(canal) },
    ],
  },
};

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legs = (page: Page) => mapRegion(page).locator("path.leg");
const casings = (page: Page) => mapRegion(page).locator("path.leg-casing");
const paddleLeg = (page: Page) => mapRegion(page).locator("path.leg-paddle");
const canalWater = (page: Page) => mapRegion(page).locator("path.access-record-flanders-ghent-terneuzen-canal");

async function open(page: Page) {
  await serveOffline(page);
  await page.addInitScript((value) => localStorage.setItem("packraft-go.trip", value), JSON.stringify(save));
  await page.goto("/");
  await expect(legs(page)).toHaveCount(2);
}

/** The middle of a drawn path (by length), in viewport pixels. */
const middleOf = (path: Locator): Promise<Pixel> =>
  path.evaluate((element) => {
    const svg = element as SVGPathElement;
    const half = svg.getPointAtLength(svg.getTotalLength() / 2);
    const { x, y } = new DOMPoint(half.x, half.y).matrixTransform(svg.getScreenCTM()!);
    return { x, y };
  });

/** Waits until a path stops moving on screen (the map has settled). */
async function settled(path: Locator) {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await middleOf(path));
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [200] },
    )
    .toBe(true);
}

/**
 * The classes of the topmost visible map path drawn at `at`, whether or not it takes clicks:
 * every path is made hit-testable for the check, and invisible ones (the phone's hit lines) are skipped.
 */
const topPathAt = (page: Page, at: Pixel): Promise<string | null> =>
  page.evaluate(({ x, y }) => {
    const paths = [...document.querySelectorAll<SVGPathElement>(".leaflet-container path")];
    const before = paths.map((path) => path.style.pointerEvents);
    for (const path of paths) path.style.pointerEvents = "visibleStroke";
    const top = document
      .elementsFromPoint(x, y)
      .find((element) => element instanceof SVGPathElement && element.getAttribute("stroke-opacity") !== "0");
    paths.forEach((path, i) => (path.style.pointerEvents = before[i]));
    return top?.getAttribute("class") ?? null;
  }, at);

/** Each leg has a white casing, wider than the leg, on the same line and drawn just before it. */
async function expectCasings(page: Page) {
  await expect(casings(page)).toHaveCount(2);
  const pairs = await legs(page).evaluateAll((lines) =>
    lines.map((line) => {
      const casing = line.previousElementSibling;
      return {
        casing: casing?.getAttribute("class") ?? "",
        sameLine: casing?.getAttribute("d") === line.getAttribute("d"),
        stroke: casing?.getAttribute("stroke"),
        wider: Number(casing?.getAttribute("stroke-width")) > Number(line.getAttribute("stroke-width")),
      };
    }),
  );
  for (const pair of pairs) {
    expect(pair.casing).toContain("leg-casing");
    expect(pair).toMatchObject({ sameLine: true, stroke: "#fff", wider: true });
  }
}

test.describe("desktop-sized window", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("legs are cased in white and drawn over the access layer's waters", async ({ page }) => {
    await open(page);
    await toggleAccessLayer(page);
    await expect(canalWater(page)).toHaveCount(1);
    // Zoom in on the canal with a coordinate search (no request), then clear its pin.
    await page.getByRole("button", { name: strings.placeSearch.label }).click();
    await page.getByRole("combobox", { name: strings.placeSearch.label }).fill("51.0885, 3.7276");
    await page.getByRole("combobox", { name: strings.placeSearch.label }).press("Enter");
    await page.getByRole("button", { name: strings.placeSearch.clear }).click();
    await settled(paddleLeg(page));

    await expectCasings(page);
    expect(await topPathAt(page, await middleOf(paddleLeg(page)))).toContain("leg-paddle");
  });
});

test.describe("phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("legs are cased in white and drawn over the access layer's waters", async ({ page }) => {
    await open(page);
    await toggleAccessLayer(page);
    await expect(canalWater(page)).toHaveCount(1);
    await settled(paddleLeg(page));

    await expectCasings(page);
    expect(await topPathAt(page, await middleOf(paddleLeg(page)))).toContain("leg-paddle");
  });
});
