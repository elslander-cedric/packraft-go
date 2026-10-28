// #62: snapping a new put-in to one of your access points (accept, undo and
// decline), and the Walloon aire warning on the leg, the day and the trip summary.
import { expect, test, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint } from "../src/core/accessPoints";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

test.use({ viewport: { width: 1400, height: 900 } });

// Durbuy is in Wallonia. 0.001 degrees of latitude is about 111 m.
const putIn = { lat: 50.3527, lng: 5.4563 };
const end = { lat: 50.3627, lng: 5.4563 };
const nearby = { lat: 50.3537, lng: 5.4563 };

const routedHike = {
  status: "routed",
  geometry: [putIn, end].map((p) => ({ ...p, elevation: 5 })),
};

async function seed(page: Page, kind: "slipway" | "official-aire") {
  const trip = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: { name: "Ourthe", points: [putIn, end], legs: [{ mode: "hike", route: routedHike }] },
  });
  const now = "2026-10-14T08:00:00.000Z";
  const added = addAccessPoint([], { id: "ap1", at: nearby, now });
  const points = serialiseAccessPoints(updateAccessPoint(added, "ap1", { kind, use: "put-in" }, now));
  await page.addInitScript(
    ([tripSave, pointsSave]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("packraft-go.trip", tripSave);
      localStorage.setItem("packraft-go.access-points", pointsSave);
    },
    [trip, points],
  );
}

const paddle = (page: Page) =>
  page
    .getByRole("group", { name: strings.legModeLabel(1) })
    .getByRole("button", { name: strings.legModePaddle });
const offer = (page: Page) => page.getByRole("region", { name: strings.snap.label });
const storedFirstPoint = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null")?.trip?.points?.[0]);

test("a new put-in near your access point offers a snap; accepting moves it and undo brings it back", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await page.goto("/");

  await paddle(page).click();
  await expect(offer(page)).toBeVisible();
  await expect(offer(page)).toContainText("put-in");
  await offer(page).getByRole("button", { name: strings.snap.accept }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedFirstPoint(page)).toEqual(nearby);

  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect.poll(() => storedFirstPoint(page)).toEqual(putIn);
});

test("declining the snap offer changes nothing", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await page.goto("/");

  await paddle(page).click();
  await offer(page).getByRole("button", { name: strings.snap.decline }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect.poll(() => storedFirstPoint(page)).toEqual(putIn);
});

test("a Walloon put-in without an official aire nearby shows the warning on the leg and a chip on its day", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, "slipway");
  await page.goto("/");
  await paddle(page).click();

  const legs = page.getByRole("complementary", { name: strings.legsPanelLabel });
  const days = page.getByRole("complementary", { name: strings.daysPanelLabel });
  await expect(legs.locator(".access-warning-aire").first()).toContainText(strings.aire.warningKind);
  // The day only points at the leg (ADR 0029); the paddle leg is also forbidden here or not, but it has a chip.
  await expect(days.locator(".day-warning-chip")).toHaveCount(1);
  await expect(days.locator(".access-warning-aire")).toHaveCount(0);

  // It never blocks: the trip can still be saved.
  const [save] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: strings.saveFileButton }).click(),
  ]);
  expect(save.suggestedFilename()).toMatch(/\.packraft\.json$/);
});

test("an official aire of yours within 200 m of the put-in removes that warning", async ({ page }) => {
  await serveOffline(page);
  await seed(page, "official-aire");
  await page.goto("/");
  await paddle(page).click();

  const legs = page.getByRole("complementary", { name: strings.legsPanelLabel });
  // The take-out at the leg's end is still not at an aire; the put-in is.
  await expect(legs.locator(".access-warning-aire")).toHaveCount(1);
  await expect(legs.locator(".access-warning-aire")).toContainText("take-out");
});
