// Place search on the desktop (#173, ADR 0030): the bar over the map searches
// on submit with the recorded Nominatim answers, moves the map to the picked
// result and pins it; coordinates jump with no request. Every external request
// goes through serveOffline, and anything else is blocked and checked.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { nominatimFixture, serveOffline } from "./support/offline";

const text = strings.placeSearch;

/** The recorded answer for each search text; any other text is a 503. */
const SEARCHES: Record<string, string> = {
  hotton: "search-hotton.json",
  luik: "search-luik.json",
  qxzvbwplm: "search-nothing-found.json",
};
const bySearchText = (url: URL) => {
  const file = SEARCHES[url.searchParams.get("q")?.toLowerCase() ?? ""];
  return file ? nominatimFixture(file)() : { status: 503, body: "" };
};

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const field = (page: Page) => page.getByRole("combobox", { name: text.label });
const results = (page: Page) => page.getByRole("listbox", { name: text.resultsLabel }).getByRole("option");
const pin = (page: Page) => mapRegion(page).locator(".search-result-marker");
const pinLabel = (page: Page) => mapRegion(page).locator(".search-result-label");

/** The requests serveOffline blocked in the running test: there must be none (no live call, ADR 0019). */
let blocked: string[] = [];
async function offline(page: Page, options: Parameters<typeof serveOffline>[1] = {}) {
  const network = await serveOffline(page, options);
  blocked = network.blocked;
  return network;
}
test.afterEach(() => expect(blocked).toEqual([]));

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

async function search(page: Page, what: string) {
  await field(page).fill(what);
  await field(page).press("Enter");
}

/** The zoom of the tiles asked for last. */
const lastZoom = (tiles: { z: number }[]) => tiles.at(-1)?.z;

test.use({ viewport: { width: 1440, height: 900 } });

test("search, pick, the map moves and pins the result, × clears it", async ({ page }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openMap(page);

  // Typing alone sends nothing: search is on submit only.
  await field(page).fill("hotton");
  await page.waitForTimeout(300);
  expect(network.nominatim).toHaveLength(0);

  await page.getByRole("button", { name: text.search, exact: true }).click();
  await expect(results(page)).toHaveCount(2);
  await expect(results(page).first()).toContainText("Hotton");
  await expect(results(page).first()).toContainText(text.kinds.municipality);
  await expect(results(page).nth(1)).toContainText(text.kinds.village);
  expect(network.nominatim).toHaveLength(1);
  // Only the text and the visible area are sent.
  const sent = network.nominatim[0];
  expect(sent.pathname).toBe("/search");
  expect(sent.searchParams.get("q")).toBe("hotton");
  expect(sent.searchParams.get("viewbox")).toMatch(/^[-\d.]+,[-\d.]+,[-\d.]+,[-\d.]+$/);

  await results(page).nth(1).click();
  await expect(results(page)).toHaveCount(0);
  await expect(pin(page)).toBeVisible();
  await expect(pinLabel(page)).toHaveText("Hotton");
  await expect(field(page)).toHaveValue("Hotton");
  // The map moved in: the village's box at Hotton, closer than the starting zoom of 8.
  await expect.poll(() => lastZoom(network.tiles)).toBeGreaterThanOrEqual(10);

  // Typing doesn't clear the marker; × does, with the text.
  await field(page).fill("hot");
  await expect(pin(page)).toBeVisible();
  await page.getByRole("button", { name: text.clear }).click();
  await expect(field(page)).toHaveValue("");
  await expect(pin(page)).toHaveCount(0);
});

test("the keyboard picks a result: arrow down, Enter", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await search(page, "hotton");
  await expect(results(page)).toHaveCount(2);
  await field(page).press("ArrowDown");
  await field(page).press("Enter");
  await expect(pinLabel(page)).toHaveText("Hotton");
  await expect(results(page)).toHaveCount(0);
});

test("Luik shows Liège, in its local name", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await search(page, "luik");
  await expect(results(page)).toHaveCount(3);
  await expect(results(page).first()).toContainText("Liège");
  await expect(results(page).first()).toContainText(text.kinds.city);
  await results(page).first().click();
  await expect(pinLabel(page)).toHaveText("Liège");
});

test("nothing found says so and keeps the map where it is", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await search(page, "qxzvbwplm");
  await expect(page.getByRole("status").filter({ hasText: text.nothingFound("qxzvbwplm") })).toBeVisible();
  await expect(pin(page)).toHaveCount(0);
});

test("a failed search offers Retry, which asks the same text and area again", async ({ page }) => {
  let fail = true;
  const network = await offline(page, {
    nominatim: (url) => (fail ? { status: 503, body: "" } : bySearchText(url)),
  });
  await openMap(page);
  await search(page, "hotton");
  const alert = page.getByRole("alert").filter({ hasText: text.failed });
  await expect(alert).toBeVisible();
  const firstArea = network.nominatim[0].searchParams.get("viewbox");

  // The map moves before Retry; the search doesn't.
  const box = (await mapRegion(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => lastZoom(network.tiles)).toBeGreaterThan(8);

  fail = false;
  await alert.getByRole("button", { name: text.retry }).click();
  await expect(results(page)).toHaveCount(2);
  expect(network.nominatim).toHaveLength(2);
  expect(network.nominatim[1].searchParams.get("q")).toBe("hotton");
  expect(network.nominatim[1].searchParams.get("viewbox")).toBe(firstArea);
});

test("offline: no request, Retry once back online", async ({ page, context }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await context.setOffline(true);
  await search(page, "hotton");
  const alert = page.getByRole("alert").filter({ hasText: text.offline });
  await expect(alert).toBeVisible();
  expect(network.nominatim).toHaveLength(0);

  await context.setOffline(false);
  await alert.getByRole("button", { name: text.retry }).click();
  await expect(results(page)).toHaveCount(2);
  expect(network.nominatim).toHaveLength(1);
});

test("coordinates jump there with no request, even offline", async ({ page, context }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await context.setOffline(true);
  await search(page, "50.27N 5.44E");
  await expect(pinLabel(page)).toHaveText("50.27N 5.44E");
  await expect.poll(() => lastZoom(network.tiles)).toBe(15);
  // The pin's point is the map's centre.
  const map = (await mapRegion(page).locator(".leaflet-container").boundingBox())!;
  const marker = (await pin(page).boundingBox())!;
  expect(Math.abs(marker.x + 14 - (map.x + map.width / 2))).toBeLessThan(2);
  expect(Math.abs(marker.y + 34 - (map.y + map.height / 2))).toBeLessThan(2);
  expect(network.nominatim).toHaveLength(0);
});

test("bad coordinates say so and send nothing", async ({ page }) => {
  const network = await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await search(page, "95, 5");
  await expect(page.getByRole("alert").filter({ hasText: text.badCoordinates })).toBeVisible();
  // Decimal commas aren't supported, but they are coordinates: never sent as a search.
  await search(page, "50,27 5,44");
  await expect(page.getByRole("alert").filter({ hasText: text.badCoordinates })).toBeVisible();
  expect(network.nominatim).toHaveLength(0);
  await expect(pin(page)).toHaveCount(0);
});

test("a click on the pin reaches the map and adds a point; trip actions leave the result alone", async ({ page }, testInfo) => {
  await offline(page);
  await openMap(page);
  await search(page, "50.27, 5.44");
  await expect(pin(page)).toBeVisible();

  const marker = (await pin(page).boundingBox())!;
  await page.mouse.click(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await expect(mapRegion(page).locator("path.point")).toHaveCount(1);

  // Undo and New trip are about the trip, not the map: the result stays.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(mapRegion(page).locator("path.point")).toHaveCount(0);
  await expect(pin(page)).toBeVisible();
  await page.getByRole("button", { name: strings.newTripButton }).click();
  await expect(pin(page)).toBeVisible();

  // Opening a trip file leaves it too.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.saveFileButton }).click(),
  ]);
  const file = testInfo.outputPath("empty.packraft.json");
  await download.saveAs(file);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: strings.openFileButton }).click(),
  ]);
  await chooser.setFiles(file);
  await expect(page.getByText(strings.openFileInvalid)).toHaveCount(0);
  await expect(pin(page)).toBeVisible();
  await expect(field(page)).toHaveValue("50.27, 5.44");
});

test("Escape closes the dropdown only: the planner's Escape doesn't fire", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openMap(page);
  const map = (await mapRegion(page).boundingBox())!;
  await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
  const point = mapRegion(page).locator("path.point");
  await point.click();
  await expect(point).toHaveAttribute("fill", "#ffd400");

  await search(page, "hotton");
  await expect(results(page)).toHaveCount(2);
  await field(page).press("Escape");
  await expect(results(page)).toHaveCount(0);
  await expect(field(page)).toHaveValue("hotton");
  await expect(point).toHaveAttribute("fill", "#ffd400");
});

test.describe("the bar never covers the access layer's date", () => {
  for (const width of [1024, 1440, 900]) {
    test(`at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await offline(page);
      await openMap(page);
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("switch", { name: strings.accessLayerToggle }).click();
      const date = page.locator(".access-overlay input[type=date]");
      await expect(date).toBeVisible();

      const bar = (await page.getByRole("search").boundingBox())!;
      const overlay = (await page.locator(".access-controls").boundingBox())!;
      const separate = (a: typeof bar, b: typeof bar) =>
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(separate(bar, overlay)).toBe(true);
      // The bar is still usable: wide enough for a place name.
      expect(bar.width).toBeGreaterThan(200);
      // Both stay inside the map.
      const map = (await mapRegion(page).boundingBox())!;
      expect(bar.x + bar.width).toBeLessThanOrEqual(map.x + map.width);
      expect(overlay.x).toBeGreaterThanOrEqual(map.x);
    });
  }
});
