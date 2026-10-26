// Nominatim adapter: implements the core's DefaultNameSource with OpenStreetMap
// Nominatim's reverse geocoding (ADR 0027, #136). It is the only module that
// talks to Nominatim, and the only one that sends your access point positions
// anywhere; nothing else about a point is sent. Usage policy: at most one
// request a second, never in bulk; the browser's Referer identifies the app,
// and the map's "© OpenStreetMap contributors" credit covers attribution.
import type { DefaultNameLookup, DefaultNameSource } from "@/core/accessPoints";
import type { LatLng } from "@/core/trip";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

/** Nominatim's usage policy: an absolute maximum of one request per second. */
export const MIN_INTERVAL_MS = 1000;

type Fetch = (input: string) => Promise<Response>;

export type NominatimOptions = {
  /** Injected for tests; defaults to the browser's fetch. */
  fetch?: Fetch;
};

const FAILED: DefaultNameLookup = { status: "failed" };

/** The request for the address at `at`, at street level. */
export function reverseUrl(at: LatLng): string {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(at.lat),
    lon: String(at.lng),
    zoom: "17",
    addressdetails: "1",
    // "No linguistic content": no name is tagged in it, so every name comes out
    // in its local form, as on signs, rather than in the browser's language.
    "accept-language": "zxx",
  });
  return `${NOMINATIM_URL}?${params.toString()}`;
}

/** Nominatim's answer where there is nothing to name, e.g. at sea. */
const NOTHING_FOUND = "Unable to geocode";

/** The place a road is in, from the most to the least local; municipality is the fallback. */
const PLACES = ["village", "town", "city", "hamlet", "municipality"];

/**
 * The default name in a reverse geocode answer: "road, place", the road or the
 * place alone, or "" when Nominatim found nothing there. Null when the answer
 * isn't one, or is another error.
 */
function defaultNameIn(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const answer = body as { address?: unknown; error?: unknown };
  if (typeof answer.address !== "object" || answer.address === null) return answer.error === NOTHING_FOUND ? "" : null;
  const address = answer.address as Record<string, unknown>;
  const field = (key: string) => (typeof address[key] === "string" ? address[key].trim() : "");
  const place = PLACES.map(field).find(Boolean) ?? "";
  return [field("road"), place].filter(Boolean).join(", ");
}

/**
 * The live default name source. Lookups wait in line, so requests start at
 * least a second apart, failed ones included; nothing is retried here.
 */
export function createNominatimNames(options: NominatimOptions = {}): DefaultNameSource {
  const fetchFn: Fetch = options.fetch ?? ((input) => fetch(input));
  let lastRequestAt = -Infinity;
  let line: Promise<unknown> = Promise.resolve();

  async function lookUp(at: LatLng): Promise<DefaultNameLookup> {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    try {
      const response = await fetchFn(reverseUrl(at));
      if (!response.ok) return FAILED;
      const name = defaultNameIn(JSON.parse(await response.text()));
      return name === null ? FAILED : { status: "found", name };
    } catch {
      return FAILED;
    }
  }

  return {
    defaultNameAt(at) {
      const answer = line.then(() => lookUp(at));
      line = answer;
      return answer;
    },
  };
}
