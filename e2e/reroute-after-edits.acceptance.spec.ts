// Drag, delete and undo on routed legs re-request only the changed legs, undo brings routes back
// without asking BRouter again, and no leg stays pending.
// BRouter is answered from recorded fixtures.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { freeMapBox, openPlanner, showAllLegs, leafRows } from "./support/planner";

type Px = { x: number; y: number };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("list", { name: strings.sectionsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => panel(page).locator(leafRows);
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const deleteBtn = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

async function openMap(page: Page) {
  await openPlanner(page);
  const box = await freeMapBox(page);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: Px, to: Px) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function expectAllRouted(page: Page, number: number) {
  await expect(legLines(page)).toHaveCount(number);
  for (let i = 0; i < number; i++) {
    await expect(legLines(page).nth(i)).toHaveClass(/leg-routed/);
    await expect(rows(page).nth(i)).toContainText(`${strings.climbLabel} 100 m`);
    await expect(rows(page).nth(i).getByRole("status")).toHaveCount(0);
  }
}

test.beforeEach(({ page }) => showAllLegs(page));

test("drag re-requests only the two changed legs; undo restores the routes without a request", async ({ page }) => {
  const net = await serveOffline(page, { brouter: () => SNAPPED });
  const point = await openMap(page);
  const pts = [
    { x: point.x - 240, y: point.y + 60 },
    { x: point.x - 80, y: point.y - 60 },
    { x: point.x + 80, y: point.y + 60 },
    { x: point.x + 240, y: point.y - 60 },
  ];
  for (const pt of pts) {
    await page.mouse.click(pt.x, pt.y);
  }
  await expectAllRouted(page, 3);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(3);
  const firstThree = net.brouter.map((url) => url.searchParams.get("lonlats"));

  await drag(page, pts[1], { x: point.x - 60, y: point.y + 150 });
  await expectAllRouted(page, 3);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(5);
  const dragged = net.brouter.slice(3).map((url) => url.searchParams.get("lonlats"));
  // Neither new request is for an unchanged leg (the third leg keeps its route).
  expect(dragged.filter((line) => firstThree.includes(line))).toEqual([]);
  // They are the two legs that meet at the moved point.
  expect(dragged[0]!.split("|")[1]).toBe(dragged[1]!.split("|")[0]);

  await undoBtn(page).click();
  await expectAllRouted(page, 3);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(5);

  // Delete a middle point: one request for the merged leg; undo: none.
  await page.mouse.click(pts[2].x, pts[2].y);
  await deleteBtn(page).click();
  await expectAllRouted(page, 2);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(6);
  await undoBtn(page).click();
  await expectAllRouted(page, 3);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(6);
  expect(net.blocked).toEqual([]);
});

test("undoing a drag while its request is still out leaves no leg stuck pending", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let number = 0;
  const net = await serveOffline(page, {
    brouter: async () => {
      // The first answer comes at once; later ones wait until the test releases them.
      if (++number > 1) {
        await held;
      }
      return SNAPPED;
    },
  });
  const point = await openMap(page);
  const pointA = { x: point.x - 150, y: point.y },
    pointB = { x: point.x + 150, y: point.y };
  await page.mouse.click(pointA.x, pointA.y);
  await page.mouse.click(pointB.x, pointB.y);
  await expectAllRouted(page, 1);

  await drag(page, pointB, { x: point.x + 150, y: point.y + 120 });
  await expect(rows(page).first().getByRole("status")).toBeVisible();
  await undoBtn(page).click();
  // The original route comes straight back, even though the drag's request is still out.
  await expectAllRouted(page, 1);
  release();
  await page.waitForTimeout(300);
  await expectAllRouted(page, 1);
  expect(net.brouter).toHaveLength(2);
});

test("repeated drag and undo keeps every leg routed and asks only for the dragged legs", async ({ page }) => {
  const net = await serveOffline(page, { brouter: () => SNAPPED });
  const point = await openMap(page);
  const pointA = { x: point.x - 150, y: point.y },
    pointB = { x: point.x, y: point.y - 80 },
    aPoint = { x: point.x + 150, y: point.y };
  for (const otherPoint of [pointA, pointB, aPoint]) {
    await page.mouse.click(otherPoint.x, otherPoint.y);
  }
  await expectAllRouted(page, 2);
  for (let i = 0; i < 3; i++) {
    await drag(page, pointB, { x: point.x + 20 * i, y: point.y + 100 });
    await page.keyboard.press("Control+z");
  }
  await expectAllRouted(page, 2);
  await page.waitForTimeout(300);
  // 2 legs drawn, then at most 2 per drag; never more.
  expect(net.brouter.length).toBeLessThanOrEqual(2 + 3 * 2);
  expect(net.blocked).toEqual([]);
});
