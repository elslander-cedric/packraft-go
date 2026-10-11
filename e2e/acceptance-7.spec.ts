// Acceptance tests for #7 (time estimates and settings), written by the tester
// from the ticket, spec #2 and ADR 0009. BRouter and tiles are answered from
// recorded fixtures; no live service is called (ADR 0019).
import { expect, test, type Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/persistence/settingsStorage";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const settingsPanel = (page: Page) => page.getByRole("region", { name: strings.settingsPanelLabel });
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const paceField = (page: Page) => settingsPanel(page).getByLabel(strings.paceFactorLabel);
const speedField = (page: Page) => settingsPanel(page).getByLabel(strings.paddleSpeedLabel);

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const byProfile = (url: URL) => (url.searchParams.get("profile") === "river" ? RIVER : TRAIL);

/** Total minutes of the first "X h YY min" / "YY min" in some text. */
function minutesIn(text: string | null): number {
  const m = (text ?? "").match(/(?:(\d+) h )?(\d+) min/);
  if (!m) throw new Error(`no time in "${text}"`);
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}
const legMinutes = async (page: Page, leg: number) => minutesIn(await rows(page).nth(leg).textContent());
const tripLine = (page: Page) => legsPanel(page).getByText(new RegExp(`^${strings.tripTotalTimeEstimate}`));

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

async function drawHikeThenPaddle(page: Page) {
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await rows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(rows(page).nth(1)).toContainText(strings.dropLabel);
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
}

test("AC1: every leg row and the trip total show a time that is labelled as an estimate", async ({ page }) => {
  const network = await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  for (const i of [0, 1]) {
    await expect(rows(page).nth(i)).toContainText(/est(\.|imated?)\s.*\d+ min/i);
  }
  await expect(tripLine(page)).toHaveText(/estimated.*\d+ min/i);
  // A sentence makes the estimate nature explicit.
  await expect(legsPanel(page)).toContainText(/estimate/i);
  expect(network.blocked).toEqual([]);
});

test("AC1: legs that could not be routed still show an estimated time; an empty trip shows none or zero", async ({
  page,
}) => {
  await serveOffline(page); // BRouter unavailable
  const clickMap = await openMap(page);
  await expect(legsPanel(page)).not.toContainText(/NaN|Infinity|undefined/);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText(/est(\.|imated?)\s.*\d+ min/i);
  await expect(legsPanel(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test("AC2/AC3/AC4: pace factor scales only hike legs, speed only paddle legs, and figures change at once", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  await expect(paceField(page)).toHaveValue("1");
  await expect(speedField(page)).toHaveValue("5");
  const hike1 = await legMinutes(page, 0);
  const paddle5 = await legMinutes(page, 1);
  const requestsBefore = network.brouter.length;

  await paceField(page).fill("2");
  await expect.poll(() => legMinutes(page, 0)).toBeGreaterThanOrEqual(2 * hike1 - 1);
  expect(await legMinutes(page, 0)).toBeLessThanOrEqual(2 * hike1 + 1);
  expect(await legMinutes(page, 1)).toBe(paddle5);

  await speedField(page).fill("10");
  await expect.poll(() => legMinutes(page, 1)).toBeLessThanOrEqual(Math.ceil(paddle5 / 2) + 1);
  expect(await legMinutes(page, 1)).toBeGreaterThanOrEqual(Math.floor(paddle5 / 2) - 1);

  // Trip total follows the legs.
  const total = minutesIn(await tripLine(page).textContent());
  const sum = (await legMinutes(page, 0)) + (await legMinutes(page, 1));
  expect(Math.abs(total - sum)).toBeLessThanOrEqual(1);

  // Changing settings is not a route edit: BRouter is not asked again.
  expect(network.brouter.length).toBe(requestsBefore);
});

test("AC4: wrong input (negative, zero, empty) never breaks the figures", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  const before = await legMinutes(page, 0);
  for (const bad of ["-1", "0", ""]) {
    await paceField(page).fill(bad);
    await expect(legsPanel(page)).not.toContainText(/NaN|Infinity|undefined/);
    expect(await legMinutes(page, 0)).toBe(before);
  }
  for (const bad of ["-5", "0", ""]) {
    await speedField(page).fill(bad);
    await expect(legsPanel(page)).not.toContainText(/NaN|Infinity|undefined/);
  }
});

test("AC5: settings persist across a reload and the times use them", async ({ page }) => {
  await serveOffline(page, { brouter: byProfile });
  await openMap(page);
  await paceField(page).fill("2");
  await speedField(page).fill("2.5");
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY))
    .toContain("2.5");

  await page.reload();
  await expect(paceField(page)).toHaveValue("2");
  await expect(speedField(page)).toHaveValue("2.5");
  await drawHikeThenPaddle(page);
  // Recorded trail at pace 1.0 is about 49 min, so about 98 min at pace 2.
  expect(Math.abs((await legMinutes(page, 0)) - 98)).toBeLessThanOrEqual(1);
  // Recorded river (~71 min at 5 km/h) is about 142 min at 2.5 km/h.
  expect(Math.abs((await legMinutes(page, 1)) - 142)).toBeLessThanOrEqual(3);
});

test("AC5: an unusable value typed in is not stored; the last good value survives a reload", async ({ page }) => {
  await serveOffline(page);
  await openMap(page);
  await paceField(page).fill("1.3");
  await paceField(page).fill("-2");
  await page.reload();
  await expect(paceField(page)).toHaveValue("1.3");
});

for (const [name, stored, pace, speed] of [
  ["not JSON", "{oops", "1", "5"],
  ["a JSON array", "[1,2]", "1", "5"],
  ["wrong types", '{"paceFactor":"fast","paddleSpeedKmh":true}', "1", "5"],
  ["one bad field", '{"paceFactor":-1,"paddleSpeedKmh":4}', "1", "4"],
] as const) {
  test(`AC5: unreadable stored settings (${name}) fall back to defaults without crashing`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await serveOffline(page, { brouter: byProfile });
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SETTINGS_KEY, stored]);
    await openMap(page);
    await expect(paceField(page)).toHaveValue(pace);
    await expect(speedField(page)).toHaveValue(speed);
    expect(errors).toEqual([]);
  });
}

// Round 2: rule approved by Cedric (ADR 0009 amendment).
const legTimeText = async (page: Page, leg: number) =>
  ((await rows(page).nth(leg).textContent()) ?? "").match(new RegExp(`${strings.legTimeEstimate} ([^A-Z]*)`))?.[1]?.trim();

test("R2: a pending hike leg shows … for its time, and so does the trip total; both get real times once routed", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await serveOffline(page, { brouter: async (url) => (await gate, byProfile(url)) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(rows(page).nth(0)).toContainText(`${strings.legTimeEstimate} …`);
  await expect(tripLine(page)).toHaveText(`${strings.tripTotalTimeEstimate} …`);
  await expect(legsPanel(page)).not.toContainText(/\d+ min/);
  release();
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
  await expect(tripLine(page)).toHaveText(new RegExp(`^${strings.tripTotalTimeEstimate} (\\d+ h )?\\d+ min$`));
  expect(await legTimeText(page, 0)).not.toContain("…");
  await expect(legsPanel(page)).not.toContainText("no climb data");
});

test("R2: a pending paddle leg keeps its own time but the trip total shows … until it is routed", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await serveOffline(page, {
    brouter: async (url) => {
      if (url.searchParams.get("profile") === "river") await gate;
      return byProfile(url);
    },
  });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await expect(rows(page).nth(1)).toContainText(strings.climbLabel);
  await rows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(rows(page).nth(1)).toContainText(new RegExp(`${strings.legTimeEstimate} (\\d+ h )?\\d+ min`));
  await expect(tripLine(page)).toHaveText(`${strings.tripTotalTimeEstimate} …`);
  release();
  await expect(rows(page).nth(1)).toContainText(strings.dropLabel);
  await expect(tripLine(page)).toHaveText(new RegExp(`^${strings.tripTotalTimeEstimate} (\\d+ h )?\\d+ min$`));
});

test("R2: a failed hike leg shows a distance-only time marked (no climb data); the trip total includes it with the marker; pace still applies", async ({
  page,
}) => {
  await serveOffline(page); // BRouter unavailable
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(rows(page).nth(0).getByRole("alert")).toBeVisible();
  const marked = /^(\d+ h )?\d+ min \(no climb data\)$/;
  expect(await legTimeText(page, 0)).toMatch(marked);
  await expect(tripLine(page)).toHaveText(new RegExp(`^${strings.tripTotalTimeEstimate} (\\d+ h )?\\d+ min \\(no climb data\\)$`));
  const before = await legMinutes(page, 0);
  expect(before).toBeGreaterThan(0);
  expect(minutesIn(await tripLine(page).textContent())).toBe(before);
  await paceField(page).fill("2");
  await expect.poll(() => legMinutes(page, 0)).toBeGreaterThanOrEqual(before * 2 - 1);
  expect(await legMinutes(page, 0)).toBeLessThanOrEqual(before * 2 + 1);
  await expect(tripLine(page)).toContainText("(no climb data)");
});

test("R2: failed hike + routed paddle: total = sum with marker; paddle row unmarked", async ({ page }) => {
  await serveOffline(page, {
    brouter: (url) => (url.searchParams.get("profile") === "river" ? RIVER : { status: 503, body: "" }),
  });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await rows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(rows(page).nth(1)).toContainText(strings.dropLabel);
  await expect(rows(page).nth(0).getByRole("alert")).toBeVisible();
  expect(await legTimeText(page, 0)).toContain("(no climb data)");
  expect(await legTimeText(page, 1)).not.toContain("no climb data");
  await expect(tripLine(page)).toContainText("(no climb data)");
  const total = minutesIn(await tripLine(page).textContent());
  const sum = (await legMinutes(page, 0)) + (await legMinutes(page, 1));
  expect(Math.abs(total - sum)).toBeLessThanOrEqual(1);
});

test("R2: a failed paddle leg is unchanged: plain time, no marker on the leg or the total", async ({ page }) => {
  await serveOffline(page, {
    brouter: (url) => (url.searchParams.get("profile") === "river" ? { status: 503, body: "" } : TRAIL),
  });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await rows(page)
    .nth(1)
    .getByRole("group", { name: strings.legModeLabel(2) })
    .getByRole("button", { name: strings.legModePaddle })
    .click();
  await expect(rows(page).nth(1).getByRole("alert")).toBeVisible();
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
  expect(await legTimeText(page, 1)).toMatch(/^(\d+ h )?\d+ min$/);
  await expect(tripLine(page)).toHaveText(new RegExp(`^${strings.tripTotalTimeEstimate} (\\d+ h )?\\d+ min$`));
});

test("R2: retrying a failed hike leg goes … while pending, then a plain time without the marker", async ({ page }) => {
  let mode: "fail" | "hold" = "fail";
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await serveOffline(page, {
    brouter: async (url) => {
      if (mode === "fail") return { status: 503, body: "" };
      await gate;
      return byProfile(url);
    },
  });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(rows(page).nth(0).getByRole("alert")).toBeVisible();
  await expect(tripLine(page)).toContainText("(no climb data)");
  mode = "hold";
  await rows(page).nth(0).getByRole("button", { name: strings.retryRouting }).click();
  await expect(rows(page).nth(0)).toContainText(`${strings.legTimeEstimate} …`);
  await expect(tripLine(page)).toHaveText(`${strings.tripTotalTimeEstimate} …`);
  release();
  await expect(rows(page).nth(0)).toContainText(strings.climbLabel);
  await expect(legsPanel(page)).not.toContainText("no climb data");
  await expect(legsPanel(page)).not.toContainText("…");
});

test("R2: a routed trip restored from autosave shows real times, not a stuck …", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await serveOffline(page, { brouter: byProfile });
  await drawHikeThenPaddle(page);
  const before = await tripLine(page).textContent();
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
  await expect(tripLine(page)).toHaveText(new RegExp(`^${strings.tripTotalTimeEstimate} (\\d+ h )?\\d+ min$`));
  expect(await tripLine(page).textContent()).toBe(before);
  expect(errors).toEqual([]);
});
