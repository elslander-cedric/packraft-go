import { useState } from "react";
import type { RouteNode } from "@/core/routeNetwork";
import type { SuggestedTrip } from "@/core/suggestedTrips";
import type { LatLng, Trip } from "@/core/trip";
import { bankSpotsOf, isTripFrom } from "@/core/tripFromSuggestion";

/**
 * The offer to save a used suggestion's bank spots as access points (ADR 0039): made once the
 * suggestion has become the trip, not when the replace question was cancelled or the
 * suggestions closed.
 */
export function useBankSpotsOffer(addAt: (places: readonly LatLng[]) => void) {
  // The suggestion Use this trip was pressed for, while it goes through bank spots.
  const [using, setUsing] = useState<SuggestedTrip | null>(null);
  const [offered, setOffered] = useState<readonly RouteNode[]>([]);
  return {
    offered,
    /** Use this trip was pressed. */
    use: (suggestion: SuggestedTrip) => setUsing(bankSpotsOf(suggestion).length > 0 ? suggestion : null),
    /** The suggestions are no longer shown; `trip` is the trip now. */
    left: (trip: Trip) => {
      if (using && isTripFrom(trip, using)) setOffered(bankSpotsOf(using));
      setUsing(null);
    },
    save: () => {
      addAt(offered.map(({ position: [lng, lat] }) => ({ lat, lng })));
      setOffered([]);
    },
    dismiss: () => setOffered([]),
  };
}
