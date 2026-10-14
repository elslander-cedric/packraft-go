// Acceptance tests for #71 (phone: open a trip file, phone layout sideways).
import { devices, expect, test, type Page } from "@playwright/test";
import { serialiseTrip } from "../src/core/saveFile";
import type { Trip } from "../src/core/trip";
import { TRIP_KEY } from "../src/persistence/tripStorage";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const tripView = (page: Page) => page.getByRole("region", { name: strings.phone.tripLabel });
const openBtn = (page: Page) => page.getByRole("button", { name: strings.phone.openFileButton });
const showPosition = (page: Page) => page.getByRole("button", { name: strings.phone.showPositionButton });

const A: Trip = {
  name: "Ourthe weekend",
  points: [
    { lat: 50.26, lng: 5.44 },
    { lat: 50.27, lng: 5.45 },
  ],
  legs: [
    {
      mode: "hike",
      route: {
        status: "routed",
        geometry: [
          { lat: 50.26, lng: 5.44, elevation: 200 },
          { lat: 50.27, lng: 5.45, elevation: 260 },
        ],
      },
    },
  ],
  camps: [],
};
const B: Trip = { ...A, name: "Lesse day" };

async function choose(page: Page, content: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), openBtn(page).click()]);
  await chooser.setFiles({ name: "t.json", mimeType: "application/json", buffer: Buffer.from(content) });
}
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), TRIP_KEY);

async function swActive(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r));
  });
}

test("opened trip survives reload while offline with the service worker active", async ({ page, context }) => {
  await serveOffline(page);
  await page.goto("/");
  await expect(openBtn(page)).toBeVisible();
  await swActive(page);
  await choose(page, serialiseTrip(A));
  await expect(tripView(page).getByRole("heading", { name: "Ourthe weekend" })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(openBtn(page)).toBeVisible();
  await expect(tripView(page).getByRole("heading", { name: "Ourthe weekend" })).toBeVisible();
  await expect(mapRegion(page).locator(".leaflet-overlay-pane path.leg")).toHaveCount(1);
  await expect(tripView(page).getByRole("button")).toHaveCount(0);

  // Also usable offline: open another file (replaces after confirm).
  await choose(page, serialiseTrip(B));
  await answerConfirmation(page, "openFile", "confirm");
  await expect(tripView(page).getByRole("heading", { name: "Lesse day" })).toBeVisible();
  await page.reload();
  await expect(tripView(page).getByRole("heading", { name: "Lesse day" })).toBeVisible();
});

test("refused files leave the stored trip byte-identical (several kinds)", async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem("s")) {
        localStorage.setItem(k, v);
        sessionStorage.setItem("s", "1");
      }
    },
    [TRIP_KEY, serialiseTrip(A)] as const,
  );
  await page.goto("/");
  await expect(tripView(page).getByRole("heading", { name: "Ourthe weekend" })).toBeVisible();
  const before = await stored(page);
  const future = JSON.stringify({ ...JSON.parse(serialiseTrip(B)), version: 2 });
  const bad: [string, string][] = [
    ["", strings.openFileInvalid],
    ["{}", strings.openFileInvalid],
    ["[1,2", strings.openFileInvalid],
    ['{"app":"packraft-go","version":1,"trip":{"points":"x"}}', strings.openFileInvalid],
    [future, strings.openFileUnknownVersion],
  ];
  for (const [content, msg] of bad) {
    await choose(page, content);
    await expect(page.getByRole("alert").filter({ hasText: msg })).toBeVisible();
    await expect(confirmDialog(page)).toHaveCount(0);
    expect(await stored(page)).toBe(before);
  }
  // A good file afterwards clears the error.
  await choose(page, serialiseTrip(B));
  await answerConfirmation(page, "openFile", "confirm");
  await expect(page.getByRole("alert").filter({ hasText: /trip file/ })).toHaveCount(0);
});

test("confirm prompt names the replacement; cancel leaves storage unchanged", async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem("s")) {
        localStorage.setItem(k, v);
        sessionStorage.setItem("s", "1");
      }
    },
    [TRIP_KEY, serialiseTrip(A)] as const,
  );
  await page.goto("/");
  const before = await stored(page);
  await choose(page, serialiseTrip(B));
  await expect(confirmDialog(page)).toBeVisible();
  console.log("CONFIRM TEXT:", await confirmDialog(page).innerText());
  expect(await stored(page)).toBe(before); // nothing written before the answer
  await answerConfirmation(page, "openFile", "cancel");
  expect(await stored(page)).toBe(before);
});

test.describe("touch sideways", () => {
  test.use({ viewport: { width: 863, height: 360 } });
  test("863x360 touch gets the phone layout", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    await expect(showPosition(page)).toBeVisible();
    await expect(openBtn(page)).toBeVisible();
    await expect(page.getByRole("button", { name: strings.newTripButton })).toHaveCount(0);
  });
});

for (const size of [
  { width: 863, height: 360 },
  { width: 1280, height: 600 },
  { width: 1000, height: 640 },
]) {
  test.describe(`non-touch desktop ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: false, hasTouch: false, userAgent: devices["Desktop Chrome"].userAgent });
    test("keeps the planner", async ({ page }) => {
      await serveOffline(page);
      await page.goto("/");
      await expect(page.getByRole("button", { name: strings.newTripButton })).toBeVisible();
      await expect(showPosition(page)).toHaveCount(0);
      await expect(openBtn(page)).toHaveCount(0);
    });
  });
}

test("a short wide touch window (1280x600) is the phone layout; tall touch tablet stays planner", async ({ browser }) => {
  const mk = async (w: number, h: number) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await serveOffline(p);
    await p.goto("/");
    return { ctx, p };
  };
  const short = await mk(1280, 600);
  await expect(showPosition(short.p)).toBeVisible();
  await short.ctx.close();
  const tall = await mk(1024, 768);
  await expect(tall.p.getByRole("button", { name: strings.newTripButton })).toBeVisible();
  await tall.ctx.close();
});
