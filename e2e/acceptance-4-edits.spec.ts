// Acceptance tests for #4 round 2 (integration with #6):
// drag, delete and undo on routed legs re-request only the changed legs, undo
// brings routes back without asking BRouter again, and no leg stays pending.
// BRouter is answered from the committed recorded responses.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { freeMapBox, openPlanner } from "./support/planner";

type Px = { x: number; y: number };

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("list", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => panel(page).getByRole("listitem");
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const deleteBtn = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };

async function openMap(page: Page) {
  await openPlanner(page);
  const box = (await freeMapBox(page));
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: Px, to: Px) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function expectAllRouted(page: Page, n: number) {
  await expect(legLines(page)).toHaveCount(n);
  for (let i = 0; i < n; i++) {
    await expect(legLines(page).nth(i)).toHaveClass(/leg-routed/);
    await expect(rows(page).nth(i)).toContainText(`${strings.climbLabel} 100 m`);
    await expect(rows(page).nth(i).getByRole("status")).toHaveCount(0);
  }
}

test("drag re-requests only the two changed legs; undo restores the routes without a request", async ({ page }) => {
  const net = await serveOffline(page, { brouter: () => SNAPPED });
  const c = await openMap(page);
  const pts = [
    { x: c.x - 240, y: c.y + 60 },
    { x: c.x - 80, y: c.y - 60 },
    { x: c.x + 80, y: c.y + 60 },
    { x: c.x + 240, y: c.y - 60 },
  ];
  for (const p of pts) await page.mouse.click(p.x, p.y);
  await expectAllRouted(page, 3);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(3);
  const firstThree = net.brouter.map((u) => u.searchParams.get("lonlats"));

  await drag(page, pts[1], { x: c.x - 60, y: c.y + 150 });
  await expectAllRouted(page, 3);
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(5);
  const dragged = net.brouter.slice(3).map((u) => u.searchParams.get("lonlats"));
  // Neither new request is for an unchanged leg (the third leg keeps its route).
  expect(dragged.filter((l) => firstThree.includes(l))).toEqual([]);
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
  const held = new Promise<void>((r) => (release = r));
  let n = 0;
  const net = await serveOffline(page, {
    brouter: async () => {
      // The first answer comes at once; later ones wait until the test releases them.
      if (++n > 1) await held;
      return SNAPPED;
    },
  });
  const c = await openMap(page);
  const a = { x: c.x - 150, y: c.y }, b = { x: c.x + 150, y: c.y };
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await expectAllRouted(page, 1);

  await drag(page, b, { x: c.x + 150, y: c.y + 120 });
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
  const c = await openMap(page);
  const a = { x: c.x - 150, y: c.y }, b = { x: c.x, y: c.y - 80 }, d = { x: c.x + 150, y: c.y };
  for (const p of [a, b, d]) await page.mouse.click(p.x, p.y);
  await expectAllRouted(page, 2);
  for (let i = 0; i < 3; i++) {
    await drag(page, b, { x: c.x + 20 * i, y: c.y + 100 });
    await page.keyboard.press("Control+z");
  }
  await expectAllRouted(page, 2);
  await page.waitForTimeout(300);
  // 2 legs drawn, then at most 2 per drag; never more.
  expect(net.brouter.length).toBeLessThanOrEqual(2 + 3 * 2);
  expect(net.blocked).toEqual([]);
});
