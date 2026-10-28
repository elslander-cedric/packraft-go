// Back to start on the desktop (GLOSSARY "Loop", ADR 0017): the edit toolbar's button adds a
// leg from the last point back to the start, and says why when it can't.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const points = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legRows = (page: Page) => legsPanel(page).getByRole("listitem");
const backButton = (page: Page) => page.getByRole("button", { name: strings.backToStartButton });
const undoButton = (page: Page) => page.getByRole("button", { name: strings.undoButton });

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("Back to start closes the route on the start point, says why when it can't, and undoes", async ({ page }) => {
  await serveOffline(page);
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];

  await expect(backButton(page)).toBeDisabled();
  await expect(backButton(page)).toHaveAccessibleDescription(strings.backToStartNeedsTwoPoints);

  await page.mouse.click(cx - 150, cy);
  await expect(backButton(page)).toBeDisabled();
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

  await expect(backButton(page)).toBeDisabled();
  await expect(backButton(page)).toHaveAccessibleDescription(strings.backToStartAlreadyThere);

  await undoButton(page).click();
  await expect(points(page)).toHaveCount(3);
  await expect(legRows(page)).toHaveCount(2);
  await expect(backButton(page)).toBeEnabled();
});
