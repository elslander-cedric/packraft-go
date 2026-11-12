// Nominatim adapter: one client that implements the core's DefaultNameSource
// with OpenStreetMap Nominatim's reverse geocoding (ADR 0027) and its
// PlaceSearchSource with Nominatim's search (ADR 0030). It is the only
// module that talks to Nominatim, and the only one that sends your access point
// positions anywhere; nothing else about a point is sent. A search sends only
// its text and the visible map area. Usage policy: at most one request a second
// for the whole app, never in bulk, never as you type; the browser's Referer
// identifies the app, and the map's "© OpenStreetMap contributors" credit
// covers attribution.
import { z } from "zod";
import type { DefaultNameLookup, DefaultNameSource } from "@/core/accessPoints";
import type { PlaceKind, PlaceSearchAnswer, PlaceSearchSource, SearchArea, SearchResult } from "@/core/placeSearch";
import type { LatLng } from "@/core/trip";

/** The service, in one place so the app can switch instance if asked to. */
export const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

/** Nominatim's usage policy: an absolute maximum of one request per second. */
export const MIN_INTERVAL_MS = 1000;

type Fetch = (input: string) => Promise<Response>;

export type NominatimOptions = {
  /** Injected for tests; defaults to the browser's fetch. */
  fetch?: Fetch;
};

const NAME_FAILED: DefaultNameLookup = { status: "failed" };

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
  return `${NOMINATIM_BASE}/reverse?${params.toString()}`;
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
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const answer = body as { address?: unknown; error?: unknown };
  if (typeof answer.address !== "object" || answer.address === null) {
    return answer.error === NOTHING_FOUND ? "" : null;
  }
  const address = answer.address as Record<string, unknown>;
  const field = (key: string) => (typeof address[key] === "string" ? address[key].trim() : "");
  const place = PLACES.map(field).find(Boolean) ?? "";
  return [field("road"), place].filter(Boolean).join(", ");
}

/** The request for `text`, ranking places in the visible `area` first without leaving others out. */
export function searchUrl(text: string, area: SearchArea): string {
  const params = new URLSearchParams({
    q: text,
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "zxx",
    limit: "5",
    viewbox: [area.west, area.south, area.east, area.north].join(","),
  });
  return `${NOMINATIM_BASE}/search?${params.toString()}`;
}

const SEARCH_FAILED: PlaceSearchAnswer = { status: "failed" };

/** The kind of a search result by its main OSM tag, `category/type`. */
const KINDS_BY_TAG: Record<string, PlaceKind> = {
  "waterway/river": "river",
  "waterway/stream": "stream",
  "waterway/weir": "weir",
  "waterway/dam": "dam",
  "natural/water": "lake",
  "water/lake": "lake",
  "landuse/reservoir": "reservoir",
  "water/reservoir": "reservoir",
  "man_made/bridge": "bridge",
  "bridge/yes": "bridge",
  "amenity/parking": "car-park",
  "tourism/camp_site": "campsite",
  "natural/peak": "peak",
};

/** Otherwise by its `addresstype`. A state is a province (Liège) and a county a district (arrondissement Liège). */
const KINDS_BY_ADDRESS_TYPE: Record<string, PlaceKind> = {
  city: "city",
  town: "town",
  village: "village",
  hamlet: "hamlet",
  municipality: "municipality",
  county: "district",
  state: "province",
  province: "province",
  region: "region",
  road: "road",
};

/** The places a result is in, from the most to the least local, for its address line. */
const ADDRESS_PLACES = ["hamlet", "village", "town", "city"];
const ADDRESS_AREAS = ["municipality", "county", "state"];

/** One of Nominatim's number strings, as a number. */
const numberText = z.string().trim().min(1).transform(Number).pipe(z.number());
/** Free text, trimmed; "" when the field is missing. */
const text = z.string().trim().catch("");

const placeSchema = z.object({
  lat: numberText,
  lon: numberText,
  name: text,
  display_name: text,
  category: text,
  type: text,
  addresstype: text,
  address: z.record(z.string(), text).catch({}),
  boundingbox: z.tuple([numberText, numberText, numberText, numberText]).optional().catch(undefined),
});
type Place = z.infer<typeof placeSchema>;

/**
 * A place's own name. Without one, the label is the start of the full address, with the road
 * after a house number: "12, Rue du Batty".
 */
function labelOf(place: Place): string {
  const parts = place.display_name.split(",").map((part) => part.trim());
  const startsWithHouseNumber = place.address.house_number && parts[0] === place.address.house_number;
  return place.name || parts.slice(0, startsWithHouseNumber ? 2 : 1).join(", ");
}

/** Where a place is, for its second line: the nearest place and area that aren't its own label. */
function addressLineOf(place: Place, label: string): string {
  const local = ADDRESS_PLACES.map((key) => place.address[key]).find((name) => name && name !== label);
  const area = ADDRESS_AREAS.map((key) => place.address[key]).find((name) => name && name !== label && name !== local);
  return [local, area].filter(Boolean).join(", ");
}

const boxOf = ([south, north, west, east]: readonly [number, number, number, number]) => ({ west, south, east, north });

/** One search result from an entry of Nominatim's list, or null when it has no usable position or label. */
function resultIn(entry: unknown): SearchResult | null {
  const parsed = placeSchema.safeParse(entry);
  const label = parsed.success ? labelOf(parsed.data) : "";
  if (!parsed.success || !label) {
    return null;
  }
  const place = parsed.data;
  const kind = place.address.house_number
    ? "address"
    : (KINDS_BY_TAG[`${place.category}/${place.type}`] ?? KINDS_BY_ADDRESS_TYPE[place.addresstype]);
  const addressLine = addressLineOf(place, label);
  return {
    label,
    ...(kind && { kind }),
    ...(addressLine && { addressLine }),
    at: { lat: place.lat, lng: place.lon },
    ...(place.boundingbox && { box: boxOf(place.boundingbox) }),
  };
}

/** The results in a search answer (`[]` is nothing found), or null when the answer isn't a list. */
function resultsIn(body: unknown): PlaceSearchAnswer | null {
  if (!Array.isArray(body)) {
    return null;
  }
  return { status: "found", results: body.map(resultIn).filter((result) => result !== null) };
}

/** The same search: the trimmed, lower-cased text and the area rounded to 2 decimals, so a small pan asks nothing new. */
function searchKey(text: string, area: SearchArea): string {
  const corners = [area.west, area.south, area.east, area.north].map((degrees) => degrees.toFixed(2));
  return `${text.trim().toLowerCase()}|${corners.join(",")}`;
}

export type Nominatim = { names: DefaultNameSource; search: PlaceSearchSource };

/**
 * The live Nominatim client. Every request waits in one line, so requests
 * start at least a second apart, failed ones included, and one at a time. A
 * waiting search goes before waiting default-name lookups, since you are
 * waiting on it; nothing is cut off or retried here.
 */
export function createNominatim(options: NominatimOptions = {}): Nominatim {
  const fetchFn: Fetch = options.fetch ?? ((input) => fetch(input));
  const searches: (() => Promise<void>)[] = [];
  const lookups: (() => Promise<void>)[] = [];
  let lastRequestAt = -Infinity;
  let running = false;
  /** Search answers for the session, asked or being asked; never stored (ADR 0030). */
  const answers = new Map<string, Promise<PlaceSearchAnswer>>();

  async function work() {
    if (running) {
      return;
    }
    running = true;
    while (searches.length > 0 || lookups.length > 0) {
      const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      // Chosen after the wait, so a search asked for meanwhile still goes first.
      const next = searches.shift() ?? lookups.shift();
      lastRequestAt = Date.now();
      await next?.();
    }
    running = false;
  }

  /** Puts a request in `queue`; `read` turns the JSON body into an answer, or null when it isn't one. */
  function request<T>(queue: (() => Promise<void>)[], url: string, read: (body: unknown) => T | null, failed: T) {
    return new Promise<T>((resolve) => {
      queue.push(async () => {
        try {
          const response = await fetchFn(url);
          resolve((response.ok && read(JSON.parse(await response.text()))) || failed);
        } catch {
          resolve(failed);
        }
      });
      void work();
    });
  }

  return {
    names: {
      defaultNameAt(at) {
        return request(
          lookups,
          reverseUrl(at),
          (body) => {
            const name = defaultNameIn(body);
            return name === null ? null : { status: "found", name };
          },
          NAME_FAILED,
        );
      },
    },
    search: {
      search(text, area) {
        const key = searchKey(text, area);
        const kept = answers.get(key);
        if (kept) {
          return kept;
        }
        const answer = request(searches, searchUrl(text.trim(), area), resultsIn, SEARCH_FAILED);
        answers.set(key, answer);
        // Failures are not kept, so Retry really asks again.
        void answer.then(({ status }) => status === "failed" && answers.delete(key));
        return answer;
      },
    },
  };
}

/** The default name source on its own client (see `createNominatim`). */
export function createNominatimNames(options: NominatimOptions = {}): DefaultNameSource {
  return createNominatim(options).names;
}
