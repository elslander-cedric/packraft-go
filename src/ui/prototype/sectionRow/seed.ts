// PROTOTYPE (section row actions): throwaway, never merged.
// Open the app with ?seed=1 to replace the stored trip by one that shows all four kinds of
// section row: chevron only, chevron and info, neither, info only. Straight-line geometry,
// so no routing call is made.
import type { LegMode, LatLng, Trip } from "@/core/trip";
import { serialiseTrip } from "@/core/saveFile";

const line = (from: LatLng, to: LatLng, startM: number, endM: number) =>
  Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
      elevation: startM + (endM - startM) * t + (i % 2 ? 9 : 0),
    };
  });

const points: LatLng[] = [
  { lat: 50.205, lng: 5.02 },
  { lat: 50.2, lng: 4.99 },
  { lat: 50.205, lng: 4.965 },
  { lat: 50.2125, lng: 4.946 },
  { lat: 50.216, lng: 4.933 },
  { lat: 50.2265, lng: 4.9225 },
  { lat: 50.237, lng: 4.912 },
  { lat: 50.25, lng: 4.9 },
  { lat: 50.26, lng: 4.91 },
];
const modes: LegMode[] = ["hike", "hike", "paddle", "paddle", "paddle", "hike", "paddle", "hike"];

export const seedTrip: Trip = {
  name: "Row prototype",
  points,
  legs: modes.map((mode, i) => ({
    mode,
    route: { status: "routed", geometry: line(points[i], points[i + 1], 240 - i * 20, 220 - i * 20), climbM: mode === "hike" ? 45 : undefined },
  })),
};

if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("seed")) {
  window.localStorage.setItem("packraft-go.trip", serialiseTrip(seedTrip));
}
