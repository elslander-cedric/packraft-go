// #59: the Walloon stretches on the access layer: coloured for the selected
// date, a date selector, and a detail panel with category, hours and the
// official link. Built-in data only; no live service is called.
import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { toggleAccessLayer } from "./support/mapMenu";
import { accessWater, holdWater } from "./support/planner";

const water = accessWater;


test("switching the date changes a Walloon stretch's colour, and the panel shows the rules", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const network = await serveOffline(page);
  await page.goto("/");
  const map = page.getByRole("region", { name: strings.mapLabel });
  await expect(map.locator(".leaflet-container")).toBeVisible();
  await toggleAccessLayer(page);

  // The Lesse below Houyet (category 1.C): open 1 October to 15 March only.
  const lesse = "walloon-1C2a";
  await expect(water(page, lesse)).toBeVisible();
  // The layer's date is in the access chip's dialog (ADR 0034).
  const chip = page.getByRole("button", { name: /^Access · / });
  const accessDialog = page.getByRole("dialog", { name: strings.planner.accessDialogTitle });
  const dateField = accessDialog.getByLabel(strings.accessDateLabel, { exact: true });
  const setDate = async (date: string) => {
    await chip.click();
    await dateField.fill(date);
    await accessDialog.getByRole("button", { name: strings.planner.accessDialogClose }).click();
    await expect(accessDialog).toHaveCount(0);
  };
  // Today is the default.
  await chip.click();
  await expect(dateField).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await accessDialog.getByRole("button", { name: strings.planner.accessDialogClose }).click();

  await setDate("2026-07-15");
  await expect(water(page, lesse)).toHaveAttribute("stroke", "#e07b00");
  await expect(water(page, lesse)).toHaveClass(/access-closed-today/);

  await setDate("2026-12-15");
  await expect(water(page, lesse)).toHaveAttribute("stroke", "#1f9d55");

  // The detail panel: category, hours for that date, the official link and the date.
  await holdWater(page, lesse);
  const detail = page.getByRole("region", { name: strings.accessDetailLabel });
  await expect(detail).toContainText(strings.accessCategory("1.C"));
  await expect(detail).toContainText("Permitted hours on 2026-12-15: 10:00-17:00");
  await expect(detail).toContainText(strings.accessStatusOn("2026-12-15"));
  await expect(detail.getByRole("link", { name: "SPW: kayak status today" })).toHaveAttribute(
    "href",
    "https://kayak.spw.wallonie.be/",
  );

  // Back to July: the panel says why it is closed today.
  await setDate("2026-07-15");
  await expect(detail.getByText(strings.accessState["closed-today"], { exact: true })).toBeVisible();
  await expect(detail).toContainText("Closed today: season");

  // "Today" goes back to the default date.
  await chip.click();
  await accessDialog.getByRole("button", { name: strings.accessTodayButton }).click();
  await expect(accessDialog.getByRole("button", { name: strings.accessTodayButton })).toHaveCount(0);
  await accessDialog.getByRole("button", { name: strings.planner.accessDialogClose }).click();
  await expect(chip).toHaveAccessibleName(strings.planner.accessChip(strings.planner.accessChipToday));

  expect(network.blocked).toEqual([]);
});
