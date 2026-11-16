import { useState } from "react";
import { latLngOf } from "@/core/geo";
import type { RouteNode } from "@/core/routeNetwork";
import type { SuggestedTrip } from "@/core/suggestedTrips";
import type { LatLng, Trip } from "@/core/trip";
import { bankSpotsOf, isTripFrom } from "@/core/tripFromSuggestedTrip";

/**
 * The offer to save a used suggested trip's bank spots as access points (ADR 0039): made once the
 * suggested trip has become the trip, not when the replace question was cancelled or the
 * suggested trips closed.
 */
export function useBankSpotsOffer(addAt: (places: readonly LatLng[]) => void) {
  // The suggested trip Use this trip was pressed for, while it goes through bank spots.
  const [using, setUsing] = useState<SuggestedTrip | null>(null);
  const [offered, setOffered] = useState<readonly RouteNode[]>([]);
  return {
    offered,
    /** Use this trip was pressed. */
    use: (suggestedTrip: SuggestedTrip) => setUsing(bankSpotsOf(suggestedTrip).length > 0 ? suggestedTrip : null),
    /** The suggested trips are no longer shown; `trip` is the trip now. */
    left: (trip: Trip) => {
      if (using && isTripFrom(trip, using)) setOffered(bankSpotsOf(using));
      setUsing(null);
    },
    save: () => {
      addAt(offered.map(({ position }) => latLngOf(position)));
      setOffered([]);
    },
    dismiss: () => setOffered([]),
  };
}
