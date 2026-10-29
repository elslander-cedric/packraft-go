// Installable app (#56, ADR 0023): a manifest, icons, and a service worker
// that caches the app shell so the app opens offline. Map tiles and BRouter
// are never cached.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { freeMapBox } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });

/** Waits until the service worker is active and controls the page. */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve));
  });
}

/** Every URL in the service worker's caches. */
const cachedUrls = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });

test("the app links a manifest that makes it installable", async ({ page, request }) => {
  await serveOffline(page);
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();

  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe(strings.appTitle);
  expect(manifest.short_name).toBe(strings.appTitle);
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe(icon.type);
  }
});

test("the service worker is registered and the app shell opens offline", async ({ page, context }) => {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page)).toBeVisible();
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();

  await expect(mapRegion(page)).toBeVisible();
  await expect(page.getByRole("button", { name: strings.phone.menu.button, exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: strings.phone.sheetLabel })).toBeVisible();
});

test("map tiles and routing answers are never cached", async ({ page }) => {
  await serveOffline(page, {
    brouter: () => ({ status: 200, body: brouterFixture("hiking-success.geojson") }),
  });
  await page.goto("/");
  await waitForServiceWorker(page);
  // Load the page again under the service worker, then route a leg.
  await page.reload();
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await freeMapBox(page));
  await page.mouse.click(box.x + box.width / 2 - 50, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2 + 50, box.y + box.height / 2);
  await expect(mapRegion(page).locator("path.leg-routed")).toHaveCount(1);

  const urls = await cachedUrls(page);
  expect(urls.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  expect(urls.filter((url) => !url.startsWith(origin))).toEqual([]);
});

test("the phone layout also opens offline after one visit", async ({ page, context }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await serveOffline(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: strings.phone.showPositionButton })).toBeVisible();
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();

  await expect(mapRegion(page)).toBeVisible();
  await expect(page.getByRole("button", { name: strings.phone.showPositionButton })).toBeVisible();
  await expect(page.getByRole("dialog", { name: strings.phone.sheetLabel })).toBeVisible();
});
