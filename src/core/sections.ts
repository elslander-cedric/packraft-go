// Sections (ADR 0021, GLOSSARY "Section"): the parts of a trip shown in the
// Sections tab and exported as separate GPX files, so each imports as one course
// on a GPS device.
import { isCamp, type LegMode, type Trip } from "./trip";

/**
 * A run of consecutive legs of the same mode, from `firstLeg` to `lastLeg`
 * (inclusive). `day` is the 1-based day the section falls on (ADR 0008).
 */
export type Section = {
  readonly mode: LegMode;
  readonly firstLeg: number;
  readonly lastLeg: number;
  readonly day: number;
};

/**
 * The trip's sections in order. A section ends where the mode changes or at a
 * camp; camps at the start or end point split nothing. A portage is just a
 * hike section between two paddle sections (ADR 0016).
 */
export function tripSections(trip: Trip): Section[] {
  const sections: Section[] = [];
  let day = 1;
  trip.legs.forEach((leg, i) => {
    const current = sections.at(-1);
    const atCamp = i > 0 && isCamp(trip, i);
    if (atCamp) day += 1;
    if (current && !atCamp && current.mode === leg.mode) {
      sections[sections.length - 1] = { ...current, lastLeg: i };
    } else {
      sections.push({ mode: leg.mode, firstLeg: i, lastLeg: i, day });
    }
  });
  return sections;
}
