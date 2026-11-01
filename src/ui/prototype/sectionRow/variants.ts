// PROTOTYPE (section row actions): throwaway, never merged.
// Where a section row's expand chevron and info button go. Switched by ?variant=.
import { createContext } from "react";

export const rowVariants = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type RowVariant = (typeof rowVariants)[number];

export const rowVariantNames: Record<RowVariant, string> = {
  A: "Today: both bottom right",
  B: "Chevron in a left gutter",
  C: "Chevron on the legs label",
  D: "Access pill opens details",
  E: "Labelled action bar",
  F: "Second tap opens, no cue",
  G: "Second tap opens, quiet chevron",
};

/** A tap on the selected row opens or closes it; the row has no buttons of its own. */
export const opensOnSecondTap = (variant: RowVariant) => variant === "F" || variant === "G";

export const RowVariantContext = createContext<RowVariant>("A");
