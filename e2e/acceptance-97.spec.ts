// #97: snap offers follow your access points; the "access points changed"
// dispatch must not clear a file error when the access points did not change.
import { expect, test, type Page } from "@playwright/test";
import { addAccessPoint, serialiseAccessPoints, updateAccessPoint } from "../src/core/accessPoints";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline } from "./support/offline";
import { freeMapCentre, legLines, openPlanner, pickNextMode, showTab, tripPanel } from "./support/planner";

test.use({ viewport: { width: 1400, height: 900 } });

// A hike leg that ends at the put-in, about 111 m from your slipway (0.001° of latitude).
const start = { lat: 50.3427, lng: 5.4563 };
const putIn = { lat: 50.3527, lng: 5.4563 };
const nearby = { lat: 50.3537, lng: 5.4563 };
const text = strings.accessPoints;

async function seed(page: Page) {
  const trip = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Ourthe",
      points: [start, putIn],
      legs: [{ mode: "hike", route: { status: "routed", geometry: [start, putIn].map((p) => ({ ...p, elevation: 5 })) } }],
    },
  });
  const now = "2026-10-14T08:00:00.000Z";
  const added = addAccessPoint([], { id: "ap1", at: nearby, now });
  const points = serialiseAccessPoints(updateAccessPoint(added, "ap1", { kind: "slipway", use: "put-in" }, now));
  await page.addInitScript(
    ([t, p]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("packraft-go.trip", t);
      localStorage.setItem("packraft-go.access-points", p);
    },
    [trip, points],
  );
}

const river = { brouter: () => ({ status: 200, body: brouterFixture("river-success.geojson") }) };

/** Draws a paddle leg from the trip's end (the put-in), which offers to snap the put-in to the slipway. */
async function drawPaddleLeg(page: Page) {
  await pickNextMode(page, "paddle");
  const centre = await freeMapCentre(page);
  await page.mouse.click(centre.x, centre.y - 150);
  await expect(legLines(page)).toHaveCount(2);
}

const offer = (page: Page) => page.getByRole("region", { name: strings.snap.label });
const fileError = (page: Page) => page.getByRole("alert").filter({ hasText: strings.openFileInvalid });

test("deleting the access point an offer points at removes the offer", async ({ page }) => {
  await serveOffline(page, river);
  await seed(page);
  await openPlanner(page);
  await drawPaddleLeg(page);
  await expect(offer(page)).toBeVisible();

  // Delete it from its row in the Access points tab.
  await showTab(page, strings.planner.tabs.accessPoints);
  await tripPanel(page)
    .locator(".planner-access-point-item")
    .getByRole("button", { name: /^Delete / })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: text.deleteConfirm.confirm }).click();
  await expect(offer(page)).toHaveCount(0);
});

test("a file error survives mount and selecting an access point (points unchanged)", async ({ page }) => {
  await serveOffline(page);
  await seed(page);
  await openPlanner(page);
  await expect(page.locator(".access-point-marker")).toHaveCount(1);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{corrupt") });
  await expect(fileError(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(fileError(page)).toBeVisible();

  // Selecting an access point (from its row) and resizing re-render without changing the points.
  await showTab(page, strings.planner.tabs.accessPoints);
  await tripPanel(page).locator(".planner-access-point-item").getByRole("button").first().click();
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.waitForTimeout(300);
  await expect(fileError(page)).toBeVisible();
});
