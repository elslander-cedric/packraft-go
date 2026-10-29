// Acceptance tests for #44. The fix is test-only: it claims a key
// pressed in the one frame before Base UI moves focus into the confirmation is
// harmless for a real user. These tests pin that claim: whatever lands in the
// gap, focus ends inside the dialog and the trip is never lost.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { confirmDialog, expectInitialFocus } from "./support/confirmDialog";
import { serveOffline } from "./support/offline";
import { freeMapBox, menuButton, openPlanner } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const newTripItem = (page: Page) => page.getByRole("menuitem", { name: strings.phone.menu.newTrip, exact: true });

/** Opens the menu by keyboard; its first item, New trip, has focus. */
async function focusNewTrip(page: Page) {
  await menuButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(newTripItem(page)).toBeFocused();
}

async function drawLeg(page: Page) {
  await openPlanner(page);
  const box = (await freeMapBox(page));
  const click = (dx: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
  await click(-100);
  await click(100);
  await expect(pointMarkers(page)).toHaveCount(2);
}

test.describe("#44: keys pressed the instant a confirmation opens", () => {
  test("Tab straight after opening: focus still ends inside the dialog, trip kept", async ({ page }) => {
    await serveOffline(page);
    await drawLeg(page);
    await focusNewTrip(page);

    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab"); // may land in the one-frame gap
    await expect(confirmDialog(page)).toBeVisible();
    await expect(confirmDialog(page).locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
    await expect(pointMarkers(page)).toHaveCount(2);
  });

  test("Enter twice in a row: never confirms, never shows two dialogs", async ({ page }) => {
    await serveOffline(page);
    await drawLeg(page);
    await focusNewTrip(page);

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // gap: New trip again; after: Cancel
    expect(await confirmDialog(page).count()).toBeLessThanOrEqual(1);
    await expect(pointMarkers(page)).toHaveCount(2);
  });

  test("expectInitialFocus: focus starts on Cancel, so a following Tab reaches Confirm", async ({ page }) => {
    await serveOffline(page);
    await drawLeg(page);
    await focusNewTrip(page);
    await page.keyboard.press("Enter");
    await expectInitialFocus(page);
    await page.keyboard.press("Tab");
    await expect(confirmDialog(page).getByRole("button", { name: strings.newTripConfirm.confirm })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pointMarkers(page)).toHaveCount(2);
  });
});
