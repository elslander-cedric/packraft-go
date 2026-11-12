// PKAYAK adapter: implements the core's OfficialStatusSource with the SPW's public
// ArcGIS map service (ADR 0035). The browser calls it directly (it allows
// any origin), with only the fields needed: layer 5 without geometry for the status,
// layer 0 for the incidents. A refresh is at most those two requests, which fail apart. The
// answers are cached for 15 minutes, and a request that doesn't answer in time counts
// as a failure. It is the only module that talks to this service. The REST API at
// kayak.spw.wallonie.be has no CORS and isn't used. See
// docs/research/kayak-spw-access-points.md.
import { dateInBrussels, type CalendarDate } from "@/core/calendarDate";
import type { Incident, OfficialIncidents } from "@/core/incident";
import type { OfficialReading, OfficialReadings, OfficialStatusSource } from "@/core/officialStatus";

export const PKAYAK_URL = "https://geoservices3.wallonie.be/arcgis/rest/services/APP_KAYAK/PKAYAK/MapServer";

/** The layer of official stretches. */
const STRETCHES_LAYER = 5;

/** The layer of incidents. */
const INCIDENTS_LAYER = 0;

/** How long an answer (or a failure) is reused: the SPW's limit on heavy use, at most once per 15 minutes per page. */
export const CACHE_MS = 15 * 60 * 1000;

/** How long one request may take, body included, before it counts as a failure. */
export const REQUEST_TIMEOUT_MS = 15 * 1000;

type Fetch = (input: string, init?: { signal: AbortSignal }) => Promise<Response>;

/** Starts a timer and returns what cancels it. */
type SetTimer = (fire: () => void, ms: number) => () => void;

export type PkayakOptions = {
  /** Injected for tests; defaults to the browser's fetch. */
  fetch?: Fetch;
  /** The clock, in milliseconds; injected for tests. */
  now?: () => number;
  /** The timer behind the request timeout; injected for tests. */
  setTimer?: SetTimer;
  serviceUrl?: string;
};

const FAILED = { status: "failed" } as const;

/**
 * One refresh: at most two requests, each answering by itself, so a slow one doesn't hold the
 * other back. Each is only made when it's asked for: a past date wants incidents but no status.
 */
type Refresh = { at: number; readings?: Promise<OfficialReadings>; incidents?: Promise<OfficialIncidents> };

/** The request for every official stretch's id (`nomtro`), status code (`stapub`) and reason (`justie`, `justif`). */
export function stretchesUrl(serviceUrl = PKAYAK_URL): string {
  const params = { where: "1=1", outFields: "nomtro,stapub,justie,justif", returnGeometry: "false", f: "json" };
  return `${serviceUrl}/${STRETCHES_LAYER}/query?${new URLSearchParams(params).toString()}`;
}

/**
 * The request for every current incident: its id, official stretch (`nomtro`), French and
 * English text (`commen`, `commene`), created, changed and expiry dates, and position.
 */
export function incidentsUrl(serviceUrl = PKAYAK_URL): string {
  const params = {
    where: "1=1",
    outFields: "id,nomtro,commen,commene,datcre,datmod,datexp",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  };
  return `${serviceUrl}/${INCIDENTS_LAYER}/query?${new URLSearchParams(params).toString()}`;
}

/** The SPW's free text, or undefined where it gives none: its empty fields are null or "". */
function text(value: unknown): string | undefined {
  return (typeof value === "string" && value.trim()) || undefined;
}

type Feature = { attributes?: Record<string, unknown>; geometry?: { x?: unknown; y?: unknown } | null };

/** The features' attributes as readings, or null when the body isn't a layer's answer (an ArcGIS error is a 200). */
function parseStretches(body: unknown): Record<string, OfficialReading> | null {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) {
    return null;
  }
  const stretches: Record<string, OfficialReading> = {};
  for (const { attributes } of features as Feature[]) {
    const id = text(attributes?.nomtro);
    if (!id) {
      continue;
    }
    const [reasonEn, reasonFr] = [text(attributes?.justie), text(attributes?.justif)];
    stretches[id] = {
      code: String(attributes?.stapub ?? ""),
      ...(reasonEn && { reasonEn }),
      ...(reasonFr && { reasonFr }),
    };
  }
  return stretches;
}

/** One of the SPW's dates, milliseconds since the epoch, as the day it falls on in Brussels. */
function spwDay(value: unknown): CalendarDate | undefined {
  return typeof value === "number" ? dateInBrussels(value) : undefined;
}

function parseIncident({ attributes, geometry }: Feature): Incident | null {
  const [spwId, x, y] = [attributes?.id, geometry?.x, geometry?.y];
  if (typeof spwId !== "number" || typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  const [officialStretch, textEn, textFr] = [
    text(attributes?.nomtro),
    text(attributes?.commene),
    text(attributes?.commen),
  ];
  const [created, changed, expires] = [
    spwDay(attributes?.datcre),
    spwDay(attributes?.datmod),
    spwDay(attributes?.datexp),
  ];
  return {
    id: `incident-${spwId}`,
    spwId,
    ...(officialStretch && { officialStretch }),
    position: [x, y],
    ...(textEn && { textEn }),
    ...(textFr && { textFr }),
    ...(created && { created }),
    ...(changed && { changed }),
    ...(expires && { expires }),
  };
}

/** The features as incidents, or null when the body isn't a layer's answer. A feature with no place on the map is left out. */
function parseIncidents(body: unknown): readonly Incident[] | null {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) {
    return null;
  }
  return (features as Feature[]).flatMap((feature) => parseIncident(feature) ?? []);
}

async function getJson(fetchFn: Fetch, setTimer: SetTimer, url: string): Promise<unknown> {
  const request = new AbortController();
  let cancelTimer = () => {};
  const timedOut = new Promise<never>((_, reject) => {
    cancelTimer = setTimer(() => {
      request.abort();
      reject(new Error("PKAYAK didn't answer in time"));
    }, REQUEST_TIMEOUT_MS);
  });
  const answer = async () => {
    const response = await fetchFn(url, { signal: request.signal });
    if (!response.ok) {
      throw new Error(`PKAYAK answered ${response.status}`);
    }
    return JSON.parse(await response.text()) as unknown;
  };
  try {
    return await Promise.race([answer(), timedOut]);
  } finally {
    cancelTimer();
  }
}

/**
 * The live official status source. One refresh per 15 minutes, of at most two requests:
 * a failure, a timeout included, is cached too, so a failing service isn't asked again
 * and again. Callers within those 15 minutes share one refresh.
 */
export function createPkayakStatusSource(options: PkayakOptions = {}): OfficialStatusSource {
  const fetchFn: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const setTimer: SetTimer =
    options.setTimer ??
    ((fire, ms) => {
      const timer = setTimeout(fire, ms);
      return () => clearTimeout(timer);
    });
  const serviceUrl = options.serviceUrl ?? PKAYAK_URL;
  let cached: Refresh | null = null;

  async function loadReadings(): Promise<OfficialReadings> {
    try {
      const stretches = parseStretches(await getJson(fetchFn, setTimer, stretchesUrl(serviceUrl)));
      return stretches ? { status: "ok", stretches } : FAILED;
    } catch {
      return FAILED;
    }
  }

  async function loadIncidents(): Promise<OfficialIncidents> {
    try {
      const incidents = parseIncidents(await getJson(fetchFn, setTimer, incidentsUrl(serviceUrl)));
      return incidents ? { status: "ok", incidents } : FAILED;
    } catch {
      return FAILED;
    }
  }

  function current(): Refresh {
    if (!cached || now() - cached.at >= CACHE_MS) {
      cached = { at: now() };
    }
    return cached;
  }

  return {
    readings: () => (current().readings ??= loadReadings()),
    incidents: () => (current().incidents ??= loadIncidents()),
  };
}
