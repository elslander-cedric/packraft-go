// Place search on a desktop-sized window (#173, ADR 0030): the pill on the top row (ADR 0034)
// opens a field that searches on submit with the recorded Nominatim answers, moves the map to
// the picked result and pins it; coordinates jump with no request. Every external request
// goes through serveOffline, and anything else is blocked and checked.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { nominatimFixture, serveOffline } from "./support/offline";
import { freeMapBox, menuItem, openPlanner, openTripFile, saveTripFile, tripPanel } from "./support/planner";
import { toggleAccessLayer } from "./support/mapMenu";

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
const pill = (page: Page) => page.getByRole("button", { name: text.label });
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
  await openPlanner(page);
}

/** Opens the field from the pill (unless it is open) and searches `what`. */
async function search(page: Page, what: string) {
  if ((await field(page).count()) === 0) await pill(page).click();
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
  await pill(page).click();
  await expect(field(page)).toBeFocused();
  await field(page).fill("hotton");
  await page.waitForTimeout(300);
  expect(network.nominatim).toHaveLength(0);

  await field(page).press("Enter");
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

  // Picking one narrows the field back to the pill, which keeps the result's name.
  await results(page).nth(1).click();
  await expect(results(page)).toHaveCount(0);
  await expect(field(page)).toHaveCount(0);
  await expect(pin(page)).toBeVisible();
  await expect(pinLabel(page)).toHaveText("Hotton");
  await expect(pill(page)).toContainText("Hotton");
  // The map moved in: the village's box at Hotton, closer than the starting zoom of 8.
  await expect.poll(() => lastZoom(network.tiles)).toBeGreaterThanOrEqual(10);
  // The result is shown in the part of the map the panel leaves free.
  const marker = (await pin(page).boundingBox())!;
  expect(marker.x + marker.width).toBeLessThanOrEqual((await tripPanel(page).boundingBox())!.x);

  // Typing doesn't clear the marker; × does, with the text.
  await pill(page).click();
  await field(page).fill("hot");
  await expect(pin(page)).toBeVisible();
  await field(page).press("Escape");
  await page.getByRole("button", { name: text.clear }).click();
  await expect(pin(page)).toHaveCount(0);
  await expect(pill(page)).toHaveAccessibleName(text.pill(undefined));
});

test("the keyboard picks a result: arrow down, Enter", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openMap(page);
  await search(page, "hotton");
  await expect(results(page)).toHaveCount(2);
  await field(page).press("ArrowDown");
  await field(page).press("Enter");
  await expect(pinLabel(page)).toHaveText("Hotton");
  await expect(pill(page)).toBeFocused();
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
  const box = (await freeMapBox(page));
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
  // The pin's point is centred across the part of the map the panel leaves free, and between
  // the pill's row and the map's bottom.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const free = await freeMapBox(page);
  const pillBox = (await pill(page).boundingBox())!;
  const marker = (await pin(page).boundingBox())!;
  expect(Math.abs(marker.x + 14 - (free.x + free.width / 2))).toBeLessThan(2);
  expect(Math.abs(marker.y + 34 - (pillBox.y + pillBox.height + free.y + free.height) / 2)).toBeLessThan(2);
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
  await menuItem(page, strings.planner.menu.newTrip);
  await expect(pin(page)).toBeVisible();

  // Opening a trip file leaves it too.
  const download = await saveTripFile(page);
  const file = testInfo.outputPath("empty.packraft.json");
  await download.saveAs(file);
  await openTripFile(page, file);
  await expect(page.getByText(strings.openFileInvalid)).toHaveCount(0);
  await expect(pin(page)).toBeVisible();
  await expect(pill(page)).toContainText("50.27, 5.44");
});

test("Escape closes the dropdown only: the planner's Escape doesn't fire", async ({ page }) => {
  await offline(page, { nominatim: bySearchText });
  await openMap(page);
  const map = (await freeMapBox(page));
  await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
  const point = mapRegion(page).locator("path.point");
  // Select it with a second click on it (later than a double tap).
  await page.waitForTimeout(450);
  await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
  await expect(point).toHaveAttribute("fill", "#ffd400");

  await search(page, "hotton");
  await expect(results(page)).toHaveCount(2);
  // Escape closes the field and its results; the selected point stays selected.
  await field(page).press("Escape");
  await expect(results(page)).toHaveCount(0);
  await expect(field(page)).toHaveCount(0);
  await expect(pill(page)).toBeFocused();
  await expect(point).toHaveAttribute("fill", "#ffd400");
});

test.describe("the pill never covers the access chip", () => {
  for (const width of [1024, 1440, 900]) {
    test(`at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await offline(page);
      await openMap(page);
      await page.evaluate(() => document.fonts.ready);
      await toggleAccessLayer(page);
      const chip = page.getByRole("button", { name: /^Access · / });
      await expect(chip).toBeVisible();
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

      const bar = (await pill(page).boundingBox())!;
      const chipBox = (await chip.boundingBox())!;
      const separate = (a: typeof bar, b: typeof bar) =>
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(separate(bar, chipBox)).toBe(true);
      // The pill is still usable: wide enough for a place name.
      expect(bar.width).toBeGreaterThan(150);
      // Both stay inside the part of the map the panel leaves free.
      const map = (await freeMapBox(page));
      expect(bar.x + bar.width).toBeLessThanOrEqual(map.x + map.width);
      expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(map.x + map.width);
      expect(chipBox.x).toBeGreaterThanOrEqual(map.x);
    });
  }
});
