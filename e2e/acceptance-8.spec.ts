// Acceptance tests for #8 (camps and per-day totals) written from
// the issue, spec #2 (stories 20-24, 30) and ADRs 0008 / 0009 before reading the
// diff. BRouter and tiles are answered from recorded fixtures (ADR 0019); every
// BRouter request is counted so "marking a camp routes nothing" can be checked.
// Ported to the one planner (ADR 0034): legs and days are tabs of the trip panel.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import {
  brouterFixture,
  serveOffline,
  type BRouterReply,
} from "./support/offline";
import {
  dayCards as dayRows,
  freeMapCentre,
  legRows,
  mapRegion,
  menuButton,
  openPlanner,
  pickNextMode,
  showTab,
  totals,
} from "./support/planner";

const KEY = "packraft-go.trip";
const showDays = (page: Page) => showTab(page, strings.planner.tabs.days);
const showLegs = (page: Page) => showTab(page, strings.planner.tabs.legs);
const dayLabels = strings.planner.dayFigures;
const pointMarkers = (page: Page) =>
  mapRegion(page).locator(".leaflet-overlay-pane path.point");
const legLines = (page: Page) =>
  mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const campMarkers = (page: Page) =>
  mapRegion(page).getByRole("img", { name: strings.campMarker });
const campButton = (page: Page) =>
  page.getByRole("button", { name: strings.campButton, exact: true });
const deleteButton = (page: Page) =>
  page.getByRole("button", { name: strings.deletePointButton });
/** Menu → Open trip, which asks for the file. */
const openBtn = (page: Page) => ({
  click: async () => {
    await menuButton(page).click();
    await page.getByRole("menuitem", { name: strings.planner.menu.openFile, exact: true }).click();
  },
});

const TRAIL: BRouterReply = {
  status: 200,
  body: brouterFixture("hiking-success.geojson"),
};
const RIVER: BRouterReply = {
  status: 200,
  body: brouterFixture("river-success.geojson"),
};
const NO_ROUTE: BRouterReply = {
  status: 400,
  body: brouterFixture("hiking-no-route-400.txt"),
};
const byProfile = (url: URL) =>
  url.searchParams.get("profile") === "river" ? RIVER : TRAIL;

function minutesIn(text: string | null): number {
  const m = (text ?? "").match(/(?:(\d+) h )?(\d+) min/);
  if (!m) throw new Error(`no time in "${text}"`);
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}
function kmIn(text: string | null, label: string): number {
  const m = (text ?? "").match(new RegExp(`${label} (\\d+\\.\\d) km`));
  if (!m) throw new Error(`no ${label} distance in "${text}"`);
  return Number(m[1]);
}
const legKm = async (page: Page, i: number) =>
  Number(
    ((await legRows(page).nth(i).textContent()) ?? "").match(
      /(\d+\.\d) km/,
    )![1],
  );
const legMin = async (page: Page, i: number) =>
  minutesIn(await legRows(page).nth(i).locator(".planner-row-time").textContent());
const dayTime = (page: Page, i: number) =>
  dayRows(page).nth(i).locator(".day-figure-time");

type Click = (dx: number) => Promise<void>;

async function openMap(page: Page): Promise<Click> {
  await openPlanner(page);
  const centre = await freeMapCentre(page);
  return (dx: number) => page.mouse.click(centre.x + dx, centre.y);
}

const XS = [-240, -80, 80, 240];

/** Hike, paddle, hike: four points, all legs routed. Clicking at XS[i] selects point i afterwards. */
async function drawThreeLegs(page: Page) {
  const click = await openMap(page);
  await click(XS[0]);
  await click(XS[1]);
  await pickNextMode(page, "paddle");
  await click(XS[2]);
  await pickNextMode(page, "hike");
  await click(XS[3]);
  await expect(legLines(page)).toHaveCount(3);
  await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
  await expect(legRows(page).nth(0)).toContainText(strings.climbLabel);
  await expect(legRows(page).nth(2)).toContainText(strings.climbLabel);
  return click;
}

async function toggleCampAt(page: Page, click: Click, point: number) {
  await click(XS[point]);
  await expect(campButton(page)).toBeEnabled();
  await campButton(page).click();
}

test("AC1: the Camp action needs a selected point; marking shows a distinct marker and unmarking removes it", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  const click = await openMap(page);
  // The camp button is only shown while a point is selected.
  await expect(campButton(page)).toHaveCount(0);
  await click(XS[0]);
  await click(XS[1]);
  await expect(campButton(page)).toHaveCount(0); // nothing selected yet
  await toggleCampAt(page, click, 1);
  await expect(campMarkers(page)).toHaveCount(1);
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "true");
  // Still the same number of points: the camp marker is not a new point.
  await expect(pointMarkers(page)).toHaveCount(2);
  await campButton(page).click();
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(campButton(page)).toHaveAttribute("aria-pressed", "false");
});

test("AC2/AC3: camps on the start and end add no day; a middle camp splits the days and their totals match the legs", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const click = await drawThreeLegs(page);
  const routed = network.brouter.length;

  await showDays(page);
  await expect(dayRows(page)).toHaveCount(1);
  await toggleCampAt(page, click, 0);
  await toggleCampAt(page, click, 3);
  await expect(campMarkers(page)).toHaveCount(2);
  await expect(dayRows(page)).toHaveCount(1);

  await toggleCampAt(page, click, 2);
  await expect(campMarkers(page)).toHaveCount(3);
  await expect(dayRows(page)).toHaveCount(2);

  await showLegs(page);
  const [h0, p1, h2] = [
    await legKm(page, 0),
    await legKm(page, 1),
    await legKm(page, 2),
  ];
  const legMinutes = [await legMin(page, 0), await legMin(page, 1), await legMin(page, 2)];
  await showDays(page);
  const day1 = await dayRows(page).nth(0).textContent();
  const day2 = await dayRows(page).nth(1).textContent();
  // Day 1 = legs 1-2 (hike + paddle), day 2 = leg 3 (hike).
  expect(day1).toContain(strings.legRange(1, 2));
  expect(day2).toContain(strings.legRange(3, 3));
  expect(
    Math.abs(kmIn(day1, dayLabels.hike) - h0),
  ).toBeLessThanOrEqual(0.1);
  expect(
    Math.abs(kmIn(day1, dayLabels.paddle) - p1),
  ).toBeLessThanOrEqual(0.1);
  expect(
    Math.abs(kmIn(day2, dayLabels.hike) - h2),
  ).toBeLessThanOrEqual(0.1);
  // A zero figure is left out of a day card.
  expect(day2).not.toContain(dayLabels.paddle);
  expect(day1).toContain(`${strings.climbLabel} 100 m`);
  expect(day2).toContain(`${strings.climbLabel} 100 m`);
  expect(day1).toContain(strings.descentLabel);
  const d1 = minutesIn(await dayTime(page, 0).textContent());
  const d2 = minutesIn(await dayTime(page, 1).textContent());
  expect(
    Math.abs(d1 - (legMinutes[0] + legMinutes[1])),
  ).toBeLessThanOrEqual(1);
  expect(d2).toBe(legMinutes[2]);
  const tripMin = minutesIn(
    await totals(page)
      .locator(".planner-total")
      .filter({ hasText: strings.planner.totals.labels.time })
      .textContent(),
  );
  expect(Math.abs(d1 + d2 - tripMin)).toBeLessThanOrEqual(1);

  // Marking camps changed no leg: nothing was routed again and the lines are still snapped.
  expect(network.brouter.length).toBe(routed);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
});

test("AC4: Ctrl+Z / Cmd+Z undoes a camp, one toggle at a time, without routing", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const click = await drawThreeLegs(page);
  const routed = network.brouter.length;
  await toggleCampAt(page, click, 1);
  await toggleCampAt(page, click, 2);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(3);

  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+z`);
  await expect(dayRows(page)).toHaveCount(2);
  await expect(campMarkers(page)).toHaveCount(1);
  await page.keyboard.press(`${mod}+z`);
  await expect(dayRows(page)).toHaveCount(1);
  await expect(campMarkers(page)).toHaveCount(0);
  // The legs are untouched, proving camps were separate undo steps.
  await showLegs(page);
  await expect(legRows(page)).toHaveCount(3);
  await expect(legRows(page).nth(1)).toContainText(strings.dropLabel);
  expect(network.brouter.length).toBe(routed);
});

test("AC3: a day with a hike leg that failed to route shows '(no climb data)'; the other day is a plain estimate", async ({
  page,
}) => {
  let failHike = false;
  await serveOffline(page, {
    brouter: (url) =>
      failHike && url.searchParams.get("profile") !== "river"
        ? NO_ROUTE
        : byProfile(url),
  });
  const click = await openMap(page);
  await click(XS[0]);
  await click(XS[1]);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  failHike = true;
  await click(XS[2]);
  await expect(legRows(page).nth(1)).toContainText(strings.retryRouting);
  const legTime = (await legRows(page).nth(1).locator(".planner-row-time").textContent())!
    .replace(`${strings.planner.legFigures.time} `, "")
    .replace(" (no climb data)", "");

  await toggleCampAt(page, click, 1);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(2);
  await expect(dayTime(page, 0)).toHaveText(
    `${dayLabels.time} 49 min`,
  );
  await expect(dayTime(page, 1)).toHaveText(
    new RegExp(`^${dayLabels.time} \\d.*min \\(no climb data\\)$`),
  );
  await expect(dayTime(page, 1)).toHaveText(
    dayLabels.time + " " + strings.timeWithoutClimb(legTime),
  );
});

test("AC3: marking a camp while a leg is still being snapped: the day shows '…' and the leg is routed once", async ({
  page,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  let heldCount = 0;
  const network = await serveOffline(page, {
    brouter: async (url) => {
      if (heldCount++ === 1) await held; // hold the second leg
      return byProfile(url);
    },
  });
  const click = await openMap(page);
  await click(XS[0]);
  await click(XS[1]);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await click(XS[2]);
  await toggleCampAt(page, click, 1);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(2);
  await expect(dayTime(page, 0)).toHaveText(
    `${dayLabels.time} 49 min`,
  );
  await expect(dayTime(page, 1)).toHaveText(
    `${dayLabels.time} ${strings.timePending}`,
  );
  release();
  await expect(dayTime(page, 1)).toHaveText(
    `${dayLabels.time} 49 min`,
  );
  expect(network.brouter.length).toBe(2);
});

test("deleting a camp's point removes its camp and joins the days", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  const click = await drawThreeLegs(page);
  await toggleCampAt(page, click, 2);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(2);
  await deleteButton(page).click(); // point 2 is still selected
  await expect(pointMarkers(page)).toHaveCount(3);
  await expect(campMarkers(page)).toHaveCount(0);
  await expect(dayRows(page)).toHaveCount(1);
});

test("camps persist through autosave: marking and unmarking are both stored", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: byProfile });
  const click = await drawThreeLegs(page);
  await toggleCampAt(page, click, 1);
  await toggleCampAt(page, click, 2);
  await expect
    .poll(
      async () =>
        JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
          .trip.camps,
    )
    .toEqual([1, 2]);
  const routed = network.brouter.length;

  await page.reload();
  await expect(pointMarkers(page)).toHaveCount(4);
  await expect(campMarkers(page)).toHaveCount(2);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(3);
  expect(network.brouter.length).toBe(routed);

  // Unmark one after the reload; the reload after that still has only the other. The map
  // fitted the trip when it opened, so the point is clicked where it is now.
  const point = (await pointMarkers(page).nth(1).boundingBox())!;
  await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
  await campButton(page).click();
  await expect(campMarkers(page)).toHaveCount(1);
  await page.reload();
  await expect(campMarkers(page)).toHaveCount(1);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(2);
  await expect(dayRows(page).nth(0)).toContainText(strings.legRange(1, 2));
});

// Updated: v1 dropped (#33). A version 1 file used to open as a trip without
// camps; now it is refused and the trip with its camps stays.
// Updated: format reset (#52). Version 1 is current again; the old version 2 is the one refused.
test("an old version 2 save file is refused as an unknown version, keeping the trip and its camps", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  page.on("dialog", (d) => void d.accept());
  const click = await drawThreeLegs(page);
  await toggleCampAt(page, click, 1);
  await expect(campMarkers(page)).toHaveCount(1);

  const older = JSON.stringify({
    format: "packraft-go-trip",
    version: 2,
    trip: {
      name: "Before camps",
      points: [
        { lat: 50.3, lng: 5.6 },
        { lat: 50.31, lng: 5.61 },
        { lat: 50.32, lng: 5.62 },
      ],
      legs: [
        {
          mode: "hike",
          route: { status: "failed", failure: { kind: "no-route" } },
        },
        {
          mode: "paddle",
          route: { status: "failed", failure: { kind: "no-route" } },
        },
      ],
    },
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    openBtn(page).click(),
  ]);
  await chooser.setFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(older),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: strings.openFileUnknownVersion }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: strings.openFileInvalid }),
  ).toHaveCount(0);
  await expect(pointMarkers(page)).toHaveCount(4);
  await expect(campMarkers(page)).toHaveCount(1);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(2);
});

test("a save file with a camp on a point that does not exist is refused and the current trip is untouched", async ({
  page,
}) => {
  await serveOffline(page, { brouter: byProfile });
  page.on("dialog", (d) => void d.accept());
  const click = await drawThreeLegs(page);
  await toggleCampAt(page, click, 1);
  // Updated: v1 dropped (#33). Version 2, so this stays about bad camps, not the version.
  // Updated: format reset (#52). Version 1, the current version.
  const bad = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Bad",
      points: [
        { lat: 50.3, lng: 5.6 },
        { lat: 50.31, lng: 5.61 },
      ],
      legs: [{ mode: "hike" }],
      camps: [5],
    },
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    openBtn(page).click(),
  ]);
  await chooser.setFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(bad),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: strings.openFileInvalid }),
  ).toBeVisible();
  await expect(pointMarkers(page)).toHaveCount(4);
  await expect(campMarkers(page)).toHaveCount(1);
  await showDays(page);
  await expect(dayRows(page)).toHaveCount(2);
});
