// The UI icons in e2e tests (#143, ADR 0028): each icon's <svg> carries its Font Awesome name.
import type { Locator } from "@playwright/test";
import type { IconDefinition } from "../../src/ui/icons/icons";

/** The given icon inside `within`. */
export const iconIn = (within: Locator, icon: IconDefinition) => within.locator(`svg[data-icon="${icon.iconName}"]`);
