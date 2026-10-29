// Back to start on a desktop-sized window (GLOSSARY "Loop", ADR 0017): the floating button adds
// a leg from the last point back to the start, and is only offered when it can (ADR 0034).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { freeMapBox, openPlanner } from "./support/planner";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const backButton = (page: Page) => page.getByRole("button", { name: strings.phone.backToStartButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("Back to start closes the route on the start point, is only offered when it can, and undoes", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  const box = (await freeMapBox(page));
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];

  await expect(backButton(page)).toHaveCount(0);

  await page.mouse.click(cx - 150, cy);
  await expect(backButton(page)).toHaveCount(0);
  await page.mouse.click(cx, cy - 100);
  await page.mouse.click(cx + 150, cy);
  await expect(points(page)).toHaveCount(3);

  await backButton(page).click();
  await expect(points(page)).toHaveCount(4);
  await expect(legRows(page)).toHaveCount(3);
  const start = await centreOf(points(page).first());
  const end = await centreOf(points(page).last());
  expect(Math.abs(end.x - start.x)).toBeLessThan(1);
  expect(Math.abs(end.y - start.y)).toBeLessThan(1);

  // Already back at the start: not offered.
  await expect(backButton(page)).toHaveCount(0);

  await undoButton(page).click();
  await expect(points(page)).toHaveCount(3);
  await expect(legRows(page)).toHaveCount(2);
  await expect(backButton(page)).toBeVisible();
});
