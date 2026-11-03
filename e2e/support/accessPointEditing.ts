// Access point editing (ADR 0036, #225): the planner's mode for changing your access points.
// Specs that mark, edit or delete access points, or read the Access points tab, enter it first.
import { expect, type Page } from "@playwright/test";
import { strings } from "../../src/ui/strings";

const text = strings.planner;

/** The floating button that enters access point editing and, pressed again, leaves it; pressed while in it. */
export const editAccessPointsButton = (page: Page) =>
  page.getByRole("button", { name: text.editAccessPointsButton, exact: true });

/** Whether the planner is in access point editing, by its button. */
export const isEditing = async (page: Page) =>
  (await editAccessPointsButton(page).getAttribute("aria-pressed")) === "true";

/** The floating button that marks an access point (access point editing only). */
export const markAccessPointButton = (page: Page) =>
  page.getByRole("button", { name: text.markAccessPointButton, exact: true });

/** The marker of the new access point placed on the map and not saved yet. */
export const draftMarker = (page: Page) => page.locator(".leaflet-container .access-point-marker.access-point-draft");

/**
 * Enters access point editing, unless the planner is already in it: the panel or sheet opens on
 * the Access points tab.
 */
export async function enterAccessPointEditing(page: Page) {
  if (!(await isEditing(page))) await editAccessPointsButton(page).click();
  await expect(editAccessPointsButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: text.tabs.accessPoints })).toHaveAttribute("aria-selected", "true");
}

/** The button pressed again: back to normal mode. */
export async function leaveAccessPointEditing(page: Page) {
  await editAccessPointsButton(page).click();
  await expect(editAccessPointsButton(page)).toHaveAttribute("aria-pressed", "false");
}

/** On a phone, raises the sheet from the peek to half, where entering leaves it, so its rows are in view. */
export async function raiseSheet(page: Page) {
  const handle = page.getByRole("slider", { name: text.resizeSheetHandle });
  await handle.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".planner")).toHaveClass(/planner-stop-half/);
}
