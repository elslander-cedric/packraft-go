// Suggested trips (ADR 0039): the Find trips button, the trip wishes dialog, the list and the
// numbered lines on the map. Works with the side panel and with the bottom sheet.
import { expect, type Page } from "@playwright/test";
import { strings } from "../../src/ui/strings";

const text = strings.planner.suggestedTrips;

export const findTripsButton = (page: Page) => page.getByRole("button", { name: strings.planner.findTripsButton });

export const wishesDialog = (page: Page) => page.getByRole("dialog", { name: text.wishesTitle });

/** The list of suggested trips, in the side panel or the sheet. */
export const suggestionList = (page: Page) => page.getByRole("list", { name: text.listLabel });
export const suggestionRows = (page: Page) => suggestionList(page).getByRole("listitem");
/** The button that selects the `n`th suggestion (from 1) in the list. */
export const suggestionRowButton = (page: Page, n: number) => suggestionRows(page).nth(n - 1).getByRole("button");

/** A selected suggestion's details, in the panel or the sheet. */
export const suggestionDetails = (page: Page, n: number) => page.getByRole("region", { name: text.detailsTitle(n) });

/** The suggestions' lines on the map, one per leg, and their number badges. */
export const suggestionLines = (page: Page) => page.locator(".leaflet-pane path.suggested-trip");
export const suggestionNumbers = (page: Page) => page.locator(".suggested-trip-number");
/** The selected suggestion's lines, and the lines faded behind it. */
export const selectedSuggestionLines = (page: Page) => page.locator(".leaflet-pane path.suggested-trip-selected");
export const fadedSuggestionLines = (page: Page) => page.locator(".leaflet-pane path.suggested-trip-faded");
/** The wide, unseen line a tap on the `n`th suggestion (from 1) hits on the map. */
export const suggestionHitLine = (page: Page, n: number) =>
  page.locator(`.leaflet-pane path.suggested-trip-hit[data-suggestion="${n - 1}"]`);

export type Wishes = {
  paddleKm?: number | null;
  maxSwitches?: number;
  date?: string;
};

/**
 * Presses Find trips, fills in the wishes given (a null paddle distance empties its field) and
 * confirms. Wishes left out keep what the dialog shows.
 */
export async function findTrips(page: Page, wishes: Wishes = {}) {
  await findTripsButton(page).click();
  const dialog = wishesDialog(page);
  await expect(dialog).toBeVisible();
  if (wishes.paddleKm !== undefined) {
    await dialog.getByLabel(text.paddleKmLabel).fill(wishes.paddleKm === null ? "" : String(wishes.paddleKm));
  }
  if (wishes.maxSwitches !== undefined) {
    await dialog.getByLabel(text.maxSwitchesLabel).fill(String(wishes.maxSwitches));
  }
  if (wishes.date !== undefined) await dialog.getByLabel(text.dateLabel).fill(wishes.date);
  await dialog.getByRole("button", { name: text.confirm }).click();
  await expect(dialog).toHaveCount(0);
}

/** Closes the suggestions with the Find trips button, pressed while they are shown. */
export async function closeSuggestions(page: Page) {
  await expect(findTripsButton(page)).toHaveAttribute("aria-pressed", "true");
  await findTripsButton(page).click();
  await expect(findTripsButton(page)).toHaveAttribute("aria-pressed", "false");
}
