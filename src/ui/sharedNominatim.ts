// One Nominatim client for the whole page (ADRs 0027, 0030): default names and
// place search share its one-request-a-second line. It is imported only when
// first needed, so the map loads without it.
import type { Nominatim } from "@/geocoding/nominatim";

let shared: Promise<Nominatim> | null = null;

/** The page's Nominatim client, created on first use. */
export function sharedNominatim(): Promise<Nominatim> {
  shared ??= import("@/geocoding/nominatim").then(({ createNominatim }) => createNominatim());
  return shared;
}
