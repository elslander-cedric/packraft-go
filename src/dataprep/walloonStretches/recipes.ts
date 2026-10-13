// How to find each Walloon stretch end in OSM (#54). Each end is a recipe:
// confluences and borders are computed, dams and bridges looked up, villages
// snapped. `inferred` marks ends Annex 1 doesn't state: they always need review.
import type { Pt } from "./geo";

export type EndRecipe =
  /** Where another waterway meets this river. */
  | { kind: "confluence"; with: string[] }
  /** Where the river leaves the country (the last crossing of the national border). */
  | { kind: "border" }
  /** The first or last point of the river's mapped course. */
  | { kind: "riverStart" }
  | { kind: "riverEnd" }
  /** A dam or weir on the river: by name, or the nearest to a place. */
  | { kind: "dam"; name?: string; near?: string; hint?: Pt; fromMouth?: boolean }
  /** A bridge over the river: by name or road name, or the nearest to a place or hint. */
  | { kind: "bridge"; name?: string; road?: string; near?: string; hint?: Pt }
  /** A village or locality, snapped to the river. */
  | { kind: "place"; name: string }
  /** A hydro power plant near a place, snapped to the river. */
  | { kind: "hydroPlant"; near: string }
  /** Another recipe moved along the river; negative metres is upstream. */
  | { kind: "offset"; base: EndRecipe; metres: number }
  /** The same point as another stretch's end, so neighbouring stretches join. */
  | { kind: "sameAs"; stretch: string; end: "from" | "to" };

export type EndSpec = { recipe: EndRecipe; inferred?: string };
export type StretchRecipe = { id: string; from: EndSpec; to: EndSpec };

const notStated = "Annex 1 gives no end; this end is inferred.";

export const STRETCH_RECIPES: readonly StretchRecipe[] = [
  {
    id: "1A1",
    from: { recipe: { kind: "bridge", near: "Sougné", hint: { lat: 50.4806, lng: 5.707 } } },
    to: { recipe: { kind: "confluence", with: ["Ourthe"] } },
  },
  {
    id: "1A2",
    // "premier barrage fixe": read as the first weir counting upstream from the mouth.
    from: { recipe: { kind: "dam", fromMouth: true } },
    to: { recipe: { kind: "confluence", with: ["Meuse", "Maas"] } },
  },
  {
    id: "1A3a",
    from: { recipe: { kind: "dam", name: "Nisramont" } },
    to: { recipe: { kind: "bridge", name: "Maboge", near: "Maboge" } },
  },
  {
    id: "1A3b",
    from: { recipe: { kind: "sameAs", stretch: "1A3a", end: "to" } },
    to: { recipe: { kind: "dam", name: "Barvaux", near: "Barvaux" } },
  },
  {
    id: "1A3c",
    from: { recipe: { kind: "sameAs", stretch: "1A3b", end: "to" } },
    to: {
      recipe: { kind: "confluence", with: ["Meuse", "Maas"] },
      inferred: "The Ourthe has two mouths in Liège (river and Dérivation); which one is meant is unclear.",
    },
  },
  {
    id: "1A4",
    // No mill named Deleau in OSM; the research proxy is Avenue Georges Deleau, Herbeumont.
    from: {
      recipe: { kind: "dam", near: "Avenue Georges Deleau (Herbeumont)", hint: { lat: 49.788, lng: 5.231 } },
    },
    to: { recipe: { kind: "border" } },
  },
  {
    id: "1B1a",
    from: { recipe: { kind: "confluence", with: ["Warche"] } },
    to: { recipe: { kind: "bridge", name: "Pont de Cheneux", near: "Cheneux" } },
  },
  {
    id: "1B1b",
    from: { recipe: { kind: "offset", base: { kind: "bridge", name: "Remouchamps", near: "Remouchamps" }, metres: -200 } },
    to: { recipe: { kind: "sameAs", stretch: "1A1", end: "from" } },
  },
  {
    id: "1B2a",
    from: { recipe: { kind: "offset", base: { kind: "bridge", name: "Houyet", near: "Houyet" }, metres: -100 } },
    to: { recipe: { kind: "offset", base: { kind: "bridge", near: "Gendron" }, metres: -50 } },
  },
  {
    id: "1B2b",
    from: { recipe: { kind: "sameAs", stretch: "1B2a", end: "to" } },
    // Two roads named Pont-à-Lesse cross the river; the hint is the old arch bridge in the hamlet.
    to: { recipe: { kind: "bridge", name: "Pont-à-Lesse", hint: { lat: 50.2266, lng: 4.9115 } } },
  },
  {
    id: "1B2c",
    from: { recipe: { kind: "sameAs", stretch: "1B2b", end: "to" } },
    to: { recipe: { kind: "sameAs", stretch: "1A2", end: "from" } },
  },
  {
    id: "1B3",
    from: { recipe: { kind: "riverStart" }, inferred: "Annex 1 lists the whole Viroin; its start is inferred." },
    to: { recipe: { kind: "border" }, inferred: "Annex 1 lists the whole Viroin; its end is inferred." },
  },
  {
    id: "1B4a",
    from: { recipe: { kind: "hydroPlant", near: "Chiny" } },
    to: { recipe: { kind: "place", name: "Martué" } },
  },
  {
    id: "1B4b",
    from: { recipe: { kind: "sameAs", stretch: "1B4a", end: "to" } },
    to: { recipe: { kind: "bridge", name: "Chassepierre", near: "Chassepierre" } },
  },
  {
    id: "1B4c",
    from: { recipe: { kind: "sameAs", stretch: "1B4b", end: "to" } },
    to: { recipe: { kind: "sameAs", stretch: "1A4", end: "from" } },
  },
  {
    id: "1C1a",
    from: { recipe: { kind: "dam", name: "Robertville" } },
    to: { recipe: { kind: "riverEnd" }, inferred: notStated },
  },
  {
    id: "1C1b",
    from: { recipe: { kind: "dam", name: "Vielsalm", near: "Vielsalm" } },
    to: { recipe: { kind: "riverEnd" }, inferred: notStated },
  },
  {
    id: "1C2a",
    from: { recipe: { kind: "bridge", name: "Barbouillons" } },
    to: { recipe: { kind: "place", name: "Chanly" } },
  },
  {
    id: "1C2b",
    from: { recipe: { kind: "dam", near: "Han-sur-Lesse" } },
    to: { recipe: { kind: "sameAs", stretch: "1B2a", end: "from" } },
  },
  {
    id: "1C2c",
    from: { recipe: { kind: "place", name: "Mirwart" } },
    to: { recipe: { kind: "riverEnd" }, inferred: notStated },
  },
  {
    id: "1C3",
    from: { recipe: { kind: "place", name: "Patignies" } },
    to: { recipe: { kind: "border" }, inferred: notStated },
  },
  {
    id: "1C4a",
    from: { recipe: { kind: "offset", base: { kind: "bridge", near: "Bodange" }, metres: -50 } },
    to: { recipe: { kind: "border" }, inferred: notStated },
  },
  {
    id: "1C4b",
    from: { recipe: { kind: "place", name: "Auel" } },
    to: { recipe: { kind: "border" }, inferred: notStated },
  },
  {
    id: "1C5a",
    from: { recipe: { kind: "confluence", with: ["Estinée", "Estinale"] } },
    to: { recipe: { kind: "riverEnd" }, inferred: notStated },
  },
  {
    id: "1C5b",
    from: { recipe: { kind: "bridge", near: "Prelle" } },
    to: { recipe: { kind: "riverEnd" }, inferred: notStated },
  },
  {
    id: "1C5c",
    from: { recipe: { kind: "bridge", road: "Rue Porte à l'Eau", near: "Houffalize" } },
    to: { recipe: { kind: "riverEnd" }, inferred: notStated },
  },
  {
    id: "1C6a",
    from: { recipe: { kind: "bridge", near: "Tintigny" } },
    to: { recipe: { kind: "sameAs", stretch: "1B4a", end: "from" } },
  },
  {
    id: "1C6b",
    from: { recipe: { kind: "bridge", near: "Martilly" } },
    to: { recipe: { kind: "bridge", near: "Suxy" } },
  },
];
