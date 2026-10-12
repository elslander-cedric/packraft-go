// Acceptance tests for #9 (autosave, restore, name and new trip), written by the
// tester from the issue, its comments and spec #2. BRouter is answered from the
// committed recorded responses; every external request is watched so the live
// server is never reached (ADR 0019).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { answerConfirmation, confirmDialog } from "./support/confirmDialog";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

type Px = { x: number; y: number };

const KEY = "packraft-go.trip";
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const panel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const pointMarkers = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.point");
const rows = (page: Page) => panel(page).getByRole("listitem");
const tripName = (page: Page) => page.getByRole("textbox", { name: strings.tripNameLabel });
const undoBtn = (page: Page) => page.getByRole("button", { name: strings.undoButton });
const deleteBtn = (page: Page) => page.getByRole("button", { name: strings.deletePointButton });
const newTripBtn = (page: Page) => page.getByRole("button", { name: strings.newTripButton });

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const NO_ROUTE: BRouterReply = { status: 400, body: brouterFixture("hiking-no-route-400.txt") };

/** The trip as stored, parsed, or null. */
const stored = (page: Page) =>
  page.evaluate((key) => {
    const text = localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  }, KEY);

async function waitForMap(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

async function openMap(page: Page): Promise<Px> {
  await page.goto("/");
  await waitForMap(page);
  const box = (await mapRegion(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function reload(page: Page) {
  await page.reload();
  await waitForMap(page);
}

async function drag(page: Page, from: Px, to: Px) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

function gate() {
  let open!: (reply: BRouterReply) => void;
  const reply = new Promise<BRouterReply>((r) => (open = r));
  return { reply, open };
}

test("#9: every change is autosaved without a reload: add, move, delete, undo, rename", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const c = await openMap(page);
  const pts = [
    { x: c.x - 200, y: c.y },
    { x: c.x, y: c.y - 60 },
    { x: c.x + 200, y: c.y },
  ];

  for (const [i, p] of pts.entries()) {
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await stored(page))?.trip.points.length).toBe(i + 1);
  }
  await expect.poll(async () => (await stored(page))?.trip.legs.map((l: { route?: { status: string } }) => l.route?.status)).toEqual(["routed", "routed"]);
  const before = (await stored(page)).trip.points[1];

  await drag(page, pts[1], { x: c.x + 20, y: c.y + 120 });
  await expect.poll(async () => (await stored(page)).trip.points[1]).not.toEqual(before);

  await page.mouse.click(c.x + 20, c.y + 120);
  await deleteBtn(page).click();
  await expect.poll(async () => (await stored(page)).trip.points.length).toBe(2);

  await undoBtn(page).click();
  await expect.poll(async () => (await stored(page)).trip.points.length).toBe(3);

  await tripName(page).fill("Lesse loop");
  await expect.poll(async () => (await stored(page)).trip.name).toBe("Lesse loop");

  const saved = await stored(page);
  expect(saved).toMatchObject({ format: expect.any(String), version: expect.any(Number) });
  expect(saved.trip).not.toHaveProperty("undoSteps");
});

test("#9: reload restores routed and failed legs, climb as stored, and makes no BRouter requests", async ({ page }) => {
  let reply = SNAPPED;
  const net = await serveOffline(page, { brouter: () => reply });
  const c = await openMap(page);

  await page.mouse.click(c.x - 200, c.y);
  await page.mouse.click(c.x, c.y);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  reply = NO_ROUTE;
  await page.mouse.click(c.x + 200, c.y);
  await expect(rows(page).nth(1)).toContainText(strings.retryRouting);
  await tripName(page).fill("Restore me");
  const pathsBefore = await legLines(page).evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
  const panelBefore = await panel(page).innerText();
  expect(net.brouter).toHaveLength(2);

  // Make it obvious if anything does ask after reload.
  reply = SNAPPED;
  await reload(page);

  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(legLines(page)).toHaveCount(2);
  await expect(tripName(page)).toHaveValue("Restore me");
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(1)).toContainText(strings.retryRouting);
  await expect(undoBtn(page)).toBeDisabled();
  await expect(panel(page).getByRole("status")).toHaveCount(0);
  expect(await legLines(page).evaluateAll((ps) => ps.map((p) => p.getAttribute("d")))).toEqual(pathsBefore);
  expect(await panel(page).innerText()).toBe(panelBefore);

  await page.waitForTimeout(800);
  expect(net.brouter).toHaveLength(2);
  expect(net.blocked).toEqual([]);

  // A second reload is just as quiet.
  await reload(page);
  await expect(legLines(page)).toHaveCount(2);
  await page.waitForTimeout(500);
  expect(net.brouter).toHaveLength(2);
});

test("#9: a leg still routing at reload is routed after the reload and does not stay pending", async ({ page }) => {
  const g = gate();
  let hold = true;
  const net = await serveOffline(page, { brouter: () => (hold ? g.reply : SNAPPED) });
  const c = await openMap(page);
  await page.mouse.click(c.x - 150, c.y);
  await page.mouse.click(c.x + 150, c.y);
  await expect(rows(page).first().getByRole("status")).toBeVisible();

  hold = false;
  await reload(page);
  g.open(SNAPPED);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(rows(page).first().getByRole("status")).toHaveCount(0);
  await expect(rows(page).first()).toContainText(`${strings.climbLabel} 100 m`);
  expect(net.brouter).toHaveLength(2);
});

test("#9: typing in the name field does not trigger planner shortcuts, and undo keeps the name", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const c = await openMap(page);
  await page.mouse.click(c.x - 150, c.y);
  await page.mouse.click(c.x + 150, c.y);
  await expect(legLines(page)).toHaveCount(1);

  await tripName(page).fill("Ambl");
  await tripName(page).press("ControlOrMeta+z");
  await tripName(page).press("Backspace");
  // Ctrl+Z in the field is the browser's text undo, not the planner's: the leg stays.
  await expect(legLines(page)).toHaveCount(1);

  await tripName(page).fill("Lesse");
  await undoBtn(page).click();
  await expect(legLines(page)).toHaveCount(0);
  await expect(pointMarkers(page)).toHaveCount(1);
  await expect(tripName(page)).toHaveValue("Lesse");
  await reload(page);
  await expect(tripName(page)).toHaveValue("Lesse");
});

test("#9: new trip clears everything; a late route answer does not bring legs back", async ({ page }) => {
  const g = gate();
  const net = await serveOffline(page, { brouter: () => g.reply });
  const c = await openMap(page);
  await tripName(page).fill("Old");
  await page.mouse.click(c.x - 150, c.y);
  await page.mouse.click(c.x + 150, c.y);
  await expect(rows(page).first().getByRole("status")).toBeVisible();

  // Updated in round 2: new trip asks for confirmation when the trip has points; accept it.
  // Updated for Base UI (#31): the question is an in-page dialog, not window.confirm.
  await newTripBtn(page).click();
  await answerConfirmation(page, "newTrip", "confirm");
  g.open(SNAPPED);
  await page.waitForTimeout(500);

  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(legLines(page)).toHaveCount(0);
  await expect(tripName(page)).toHaveValue("");
  await expect(panel(page)).toContainText(strings.legsPanelEmpty);
  expect((await stored(page)).trip).toEqual({ name: "", points: [], legs: [] });

  // Pressing it again on an empty trip is harmless.
  await newTripBtn(page).click();
  await reload(page);
  await expect(pointMarkers(page)).toHaveCount(0);
  await expect(panel(page)).toContainText(strings.legsPanelEmpty);
  expect(net.brouter).toHaveLength(1);
});

for (const [label, text] of [
  ["not JSON", "{corrupt"],
  ["JSON null", "null"],
  ["a newer version", JSON.stringify({ format: "packraft-go-trip", version: 99, trip: { name: "x", points: [], legs: [] } })],
  // Updated: v1 dropped (#33). Version 2, so this stays about damaged data, not the version.
  ["legs that do not match points", JSON.stringify({ format: "packraft-go-trip", version: 2, trip: { name: "x", points: [{ lat: 50, lng: 5 }], legs: [{ mode: "hike" }] } })],
  ["an empty string", ""],
] as const) {
  test(`#9: corrupt storage (${label}) opens an empty trip with no errors, and drawing works again`, async ({ page }) => {
    const net = await serveOffline(page, { brouter: () => SNAPPED });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ([key, value]) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("seeded", "1");
        }
      },
      [KEY, text],
    );
    const c = await openMap(page);

    await expect(panel(page)).toContainText(strings.legsPanelEmpty);
    await expect(pointMarkers(page)).toHaveCount(0);
    await expect(tripName(page)).toHaveValue("");

    await page.mouse.click(c.x - 150, c.y);
    await page.mouse.click(c.x + 150, c.y);
    await expect(legLines(page)).toHaveClass(/leg-routed/);
    await reload(page);
    // Updated (#28): a newer-version save is kept, not overwritten by the drawing, so it reloads empty with a warning.
    const kept = label === "a newer version";
    await expect(legLines(page)).toHaveCount(kept ? 0 : 1);
    await expect(page.getByRole("alert").filter({ hasText: strings.autosaveUnknownVersion })).toHaveCount(kept ? 1 : 0);
    await page.waitForTimeout(300);
    expect(net.brouter).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test("#9: blocked browser storage does not crash the planner", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  const c = await openMap(page);
  await expect(panel(page)).toContainText(strings.legsPanelEmpty);
  await page.mouse.click(c.x - 150, c.y);
  await page.mouse.click(c.x + 150, c.y);
  await tripName(page).fill("No storage");
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  expect(errors).toEqual([]);
});

// Round 2 rule (approved by Cedric): New trip asks "Start a new trip? Your current
// trip will be lost." when the trip has at least one point, does nothing on cancel,
// and does not ask for an empty trip.
// Updated for Base UI (#31): the question is an in-page Alert Dialog (title +
// message, same wording) answered with its buttons, instead of window.confirm.

test("#9 round 2: a single point is enough to ask; cancel keeps it, OK clears it, and an empty trip is not asked about", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  const c = await openMap(page);
  expect(`${strings.newTripConfirm.title} ${strings.newTripConfirm.message}`).toBe(
    "Start a new trip? Your current trip will be lost.",
  );

  await page.mouse.click(c.x, c.y);
  await expect(pointMarkers(page)).toHaveCount(1);
  await expect.poll(async () => (await stored(page))?.trip.points.length).toBe(1);

  await newTripBtn(page).click();
  await answerConfirmation(page, "newTrip", "cancel");
  await page.waitForTimeout(300);
  await expect(pointMarkers(page)).toHaveCount(1);
  expect((await stored(page)).trip.points).toHaveLength(1);

  // Cancelling twice in a row still changes nothing.
  await newTripBtn(page).click();
  await answerConfirmation(page, "newTrip", "cancel");
  await expect(pointMarkers(page)).toHaveCount(1);

  await newTripBtn(page).click();
  await answerConfirmation(page, "newTrip", "confirm");
  await expect(pointMarkers(page)).toHaveCount(0);
  expect((await stored(page)).trip).toEqual({ name: "", points: [], legs: [] });

  // Now empty: no question.
  await newTripBtn(page).click();
  await page.waitForTimeout(300);
  await expect(confirmDialog(page)).toHaveCount(0);
});

test("#9 round 2: a trip restored after reload is asked about; a trip emptied by undo is not", async ({ page }) => {
  await serveOffline(page, { brouter: () => SNAPPED });
  let c = await openMap(page);

  await page.mouse.click(c.x - 150, c.y);
  await page.mouse.click(c.x + 150, c.y);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await reload(page);
  await expect(pointMarkers(page)).toHaveCount(2);

  await newTripBtn(page).click();
  await answerConfirmation(page, "newTrip", "cancel");
  await expect(pointMarkers(page)).toHaveCount(2);
  await reload(page);
  await expect(pointMarkers(page)).toHaveCount(2);

  // Start fresh, add one point and undo it: the trip has no points again.
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
  c = await openMap(page);
  await expect(pointMarkers(page)).toHaveCount(0);
  await page.mouse.click(c.x, c.y);
  await expect(pointMarkers(page)).toHaveCount(1);
  await undoBtn(page).click();
  await expect(pointMarkers(page)).toHaveCount(0);
  await tripName(page).fill("Named but empty");
  await newTripBtn(page).click();
  await expect(tripName(page)).toHaveValue("");
  await expect(confirmDialog(page)).toHaveCount(0);
});
