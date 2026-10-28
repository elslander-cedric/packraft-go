// Nominatim adapter: one client that implements the core's DefaultNameSource
// with OpenStreetMap Nominatim's reverse geocoding (ADR 0027, #136) and its
// PlaceSearchSource with Nominatim's search (ADR 0030, #172). It is the only
// module that talks to Nominatim, and the only one that sends your access point
// positions anywhere; nothing else about a point is sent. A search sends only
// its text and the visible map area. Usage policy: at most one request a second
// for the whole app, never in bulk, never as you type; the browser's Referer
// identifies the app, and the map's "© OpenStreetMap contributors" credit
// covers attribution.
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
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const answer = body as { address?: unknown; error?: unknown };
  if (typeof answer.address !== "object" || answer.address === null) return answer.error === NOTHING_FOUND ? "" : null;
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

/** A number from one of Nominatim's number strings, or null. */
function numberIn(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

/** One search result from an entry of Nominatim's list, or null when it has no usable position. */
function resultIn(entry: unknown): SearchResult | null {
  if (typeof entry !== "object" || entry === null) return null;
  const place = entry as Record<string, unknown>;
  const lat = numberIn(place.lat);
  const lng = numberIn(place.lon);
  if (lat === null || lng === null) return null;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const address = (typeof place.address === "object" && place.address !== null ? place.address : {}) as Record<
    string,
    unknown
  >;

  // Without a name of its own, the label is the start of the full address,
  // with the road after a house number: "12, Rue du Batty".
  const houseNumber = text(address.house_number);
  const parts = text(place.display_name).split(",").map((part) => part.trim());
  const start = houseNumber && parts[0] === houseNumber ? parts.slice(0, 2) : parts.slice(0, 1);
  const label = text(place.name) || start.join(", ");
  if (!label) return null;

  const kind = houseNumber
    ? "address"
    : (KINDS_BY_TAG[`${text(place.category)}/${text(place.type)}`] ?? KINDS_BY_ADDRESS_TYPE[text(place.addresstype)]);

  const local = ADDRESS_PLACES.map((key) => text(address[key])).find((name) => name && name !== label);
  const area = ADDRESS_AREAS.map((key) => text(address[key])).find((name) => name && name !== label && name !== local);
  const addressLine = [local, area].filter(Boolean).join(", ");

  const bounds = Array.isArray(place.boundingbox) ? place.boundingbox.map(numberIn) : [];
  const [south, north, west, east] = bounds;
  const box =
    bounds.length === 4 && south !== null && north !== null && west !== null && east !== null
      ? { west, south, east, north }
      : undefined;

  return {
    label,
    ...(kind && { kind }),
    ...(addressLine && { addressLine }),
    at: { lat, lng },
    ...(box && { box }),
  };
}

/** The results in a search answer (`[]` is nothing found), or null when the answer isn't a list. */
function resultsIn(body: unknown): PlaceSearchAnswer | null {
  if (!Array.isArray(body)) return null;
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
    if (running) return;
    running = true;
    while (searches.length > 0 || lookups.length > 0) {
      const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
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
        return request(lookups, reverseUrl(at), (body) => {
          const name = defaultNameIn(body);
          return name === null ? null : { status: "found", name };
        }, NAME_FAILED);
      },
    },
    search: {
      search(text, area) {
        const key = searchKey(text, area);
        const kept = answers.get(key);
        if (kept) return kept;
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
