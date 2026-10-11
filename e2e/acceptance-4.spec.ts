// Acceptance tests for #4 (hike legs snap to trails), written by the tester
// from the issue's acceptance criteria. BRouter is answered from the committed
// recorded responses; every request the page makes is watched so the live
// server is never reached.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => panel(page).getByRole("listitem");

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const NO_ROUTE: BRouterReply = { status: 400, body: brouterFixture("hiking-no-route-400.txt") };
const DOWN: BRouterReply = { status: 503, body: "" };

/** Records every request that left the browser for the network unanswered by a stub. */
function watchLiveTraffic(page: Page) {
  const live: string[] = [];
  page.on("requestfinished", async (request) => {
    const url = new URL(request.url());
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return;
    const response = await request.response();
    // Stubbed responses carry our own CORS header; anything else came from the network.
    if (response && !response.headers()["access-control-allow-origin"] && !url.hostname.endsWith("opentopomap.org")) {
      live.push(request.url());
    }
  });
  return live;
}

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

function gate() {
  let open!: (reply: BRouterReply) => void;
  const reply = new Promise<BRouterReply>((r) => (open = r));
  return { reply, open };
}

test("#4: a snapped hike leg shows pending, then the trail with distance, climb and descent", async ({ page }) => {
  const live = watchLiveTraffic(page);
  const g = gate();
  const net = await serveOffline(page, { brouter: () => g.reply });
  const click = await openMap(page);

  await click(-120, 40);
  await click(120, -40);

  // Pending indicator, both in the panel and on the map.
  const row = rows(page).first();
  await expect(row.getByRole("status")).toBeVisible();
  await expect(legLines(page)).toHaveClass(/pending/);
  await expect(row).not.toContainText(strings.climbLabel);

  g.open(SNAPPED);

  await expect(row.getByRole("status")).toHaveCount(0);
  await expect(row).toContainText(/3\.2 km/);
  // Updated in round 2 (Cedric's decision on PR #16): smoothed climb/descent; raw sums were 118/78.
  await expect(row).toContainText(`${strings.climbLabel} 100 m`);
  await expect(row).toContainText(`${strings.descentLabel} 59 m`);
  await expect(panel(page).getByText(strings.tripTotalDistance)).toContainText("3.2 km");
  await expect(legLines(page)).not.toHaveAttribute("stroke-dasharray", /.+/);

  expect(net.brouter).toHaveLength(1);
  expect(net.brouter[0].searchParams.get("profile")).toMatch(/hiking/);
  expect(net.blocked).toEqual([]);
  expect(live).toEqual([]);
});

test("#4: routed legs are not requested again as more points are added", async ({ page }) => {
  const net = await serveOffline(page, { brouter: () => SNAPPED });
  const click = await openMap(page);

  await click(-150, 0);
  for (const [i, dx] of [-50, 50, 150].entries()) {
    await click(dx, 0);
    await expect(legLines(page)).toHaveCount(i + 1);
    await expect(legLines(page).nth(i)).toHaveClass(/routed/);
  }
  await expect(rows(page)).toHaveCount(3);
  // Give any stray re-request a chance to show up.
  await page.waitForTimeout(500);
  expect(net.brouter).toHaveLength(3);
  expect(new Set(net.brouter.map((u) => u.searchParams.get("lonlats"))).size).toBe(3);
});

test("#4: a failed leg stays dashed and straight with a message; retry while still down fails again; retry when up snaps it", async ({ page }) => {
  const replies = [NO_ROUTE, DOWN, SNAPPED];
  const net = await serveOffline(page, { brouter: () => replies.shift() ?? SNAPPED });
  const click = await openMap(page);

  await click(-120, 0);
  await click(120, 0);

  const row = rows(page).first();
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed["no-route"]);
  const line = legLines(page);
  await expect(line).toHaveAttribute("stroke-dasharray", /\d/);
  expect(((await line.getAttribute("d")) ?? "").match(/[A-Za-z]/g)).toEqual(["M", "L"]);
  await expect(rows(page)).toHaveCount(1);
  await expect(row).toContainText("km");

  const retry = row.getByRole("button", { name: strings.retryRouting });
  await retry.click();
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed.unavailable);
  await expect(line).toHaveAttribute("stroke-dasharray", /\d/);

  await row.getByRole("button", { name: strings.retryRouting }).click();
  await expect(legLines(page)).toHaveClass(/routed/);
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(row.getByRole("button", { name: strings.retryRouting })).toHaveCount(0);
  await expect(row).toContainText(`${strings.climbLabel} 100 m`);
  expect(net.brouter).toHaveLength(3);
  expect(net.blocked).toEqual([]);
});

test("#4: double-clicking retry sends only one request", async ({ page }) => {
  const replies: BRouterReply[] = [DOWN];
  const g = gate();
  const net = await serveOffline(page, { brouter: () => replies.shift() ?? g.reply });
  const click = await openMap(page);

  await click(-100, 0);
  await click(100, 0);
  const retry = rows(page).first().getByRole("button", { name: strings.retryRouting });
  await expect(retry).toBeVisible();
  await retry.dblclick();
  await expect(rows(page).first().getByRole("status")).toBeVisible();
  await page.waitForTimeout(300);
  expect(net.brouter).toHaveLength(2);
  g.open(SNAPPED);
  await expect(legLines(page)).toHaveClass(/routed/);
});

test("#4: one failing leg does not disturb its routed neighbours", async ({ page }) => {
  let n = 0;
  await serveOffline(page, { brouter: () => (++n === 2 ? NO_ROUTE : SNAPPED) });
  const click = await openMap(page);

  await click(-150, 0);
  await click(0, 0);
  await expect(legLines(page).nth(0)).toHaveClass(/routed/);
  await click(150, 0);
  await expect(legLines(page).nth(1)).toHaveClass(/failed/);
  await click(150, 100);
  await expect(legLines(page).nth(2)).toHaveClass(/routed/);

  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
  await expect(rows(page).nth(1).getByRole("alert")).toBeVisible();
  await expect(rows(page).nth(2)).toContainText(strings.climbLabel);
});
