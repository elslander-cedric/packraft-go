import { useState } from "react";
import type { TripSummary } from "@/core/summarise";
import type { LatLng, Trip } from "@/core/trip";

/** Where a run of legs goes: its points and its legs' routes. */
function legsArea(trip: Trip, { firstLeg, lastLeg }: { firstLeg: number; lastLeg: number }): LatLng[] {
  const area: LatLng[] = trip.points.slice(firstLeg, lastLeg + 2);
  for (const leg of trip.legs.slice(firstLeg, lastLeg + 1))
    if (leg.route?.status === "routed") area.push(...leg.route.geometry);
  return area;
}

/**
 * The rows of the Sections and Days tabs: which one is marked, which sections show their legs,
 * and which leg's or section's details dialog is open. A tap on a row shows it on the map
 * (`showArea`), every time, as the map may have been panned away since.
 */
export function useTripRows(trip: Trip, summary: TripSummary, showArea: (area: readonly LatLng[]) => void) {
  const [selectedLeg, setSelectedLeg] = useState<number | undefined>(undefined);
  const [selectedSection, setSelectedSection] = useState<number | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);
  const [detailsLeg, setDetailsLeg] = useState<number | null>(null);
  const [detailsSection, setDetailsSection] = useState<number | null>(null);

  // Sections have no identity of their own, so the open ones are kept by first leg. An edit
  // that leaves no section of several legs starting there closes it.
  const [openSections, setOpenSections] = useState<readonly number[]>([]);
  const stillOpen = openSections.filter((first) =>
    summary.sections.some((section) => section.firstLeg === first && section.lastLeg > first),
  );
  if (stillOpen.length !== openSections.length) setOpenSections(stillOpen);
  const toggleSection = (first: number) =>
    setOpenSections((open) => (open.includes(first) ? open.filter((leg) => leg !== first) : [...open, first]));

  const selectLeg = (index: number) => {
    setSelectedLeg(index);
    setSelectedSection(undefined);
    const route = trip.legs[index]?.route;
    showArea(route?.status === "routed" ? route.geometry : trip.points.slice(index, index + 2));
  };

  /** A tap on the already selected section opens or closes it, when it has several legs. */
  const selectSection = (index: number) => {
    const section = summary.sections[index];
    if (!section) return;
    const hasSeveralLegs = section.lastLeg > section.firstLeg;
    if (index === selectedSection && hasSeveralLegs) toggleSection(section.firstLeg);
    setSelectedSection(index);
    setSelectedLeg(undefined);
    showArea(legsArea(trip, section));
  };

  /** A tap on the already selected day unselects it. */
  const selectDay = (index: number) => {
    const day = summary.days[index];
    if (!day) return;
    if (index === selectedDay) {
      setSelectedDay(undefined);
      return;
    }
    setSelectedDay(index);
    showArea(legsArea(trip, day));
  };

  return {
    selectedLeg,
    selectedSection,
    selectedDay,
    openSections: stillOpen,
    selectLeg,
    selectSection,
    selectDay,
    detailsLeg,
    setDetailsLeg,
    detailsSection,
    setDetailsSection,
  };
}
