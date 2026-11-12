// Live PKAYAK check (ADR 0035): compares what the SPW's undocumented map service
// answers today with the recorded fixtures our tests replay, so we notice when it
// changes its fields or codes. Run by hand with `npm run check:kayak`; never part of
// `npm test`, `npm run e2e` or CI (ADR 0019). Nothing here writes fixtures:
// re-recording stays a deliberate step.
import {
  AIRE_FIELDS,
  buildObstacles,
  buildOfficialAires,
  OBSTACLE_FIELDS,
  OBSTACLE_KINDS,
  PKAYAK_LAYERS,
  pkayakQuery,
  type PkayakAnswer,
} from "@/access/prepare/spw";
import { dateInBrussels } from "@/core/calendarDate";
import { officialVerdict } from "@/core/officialStatus";
import type { Finding, FindingLevel, RecordedResponse } from "@/routing/liveCheck";
import { createPkayakStatusSource, incidentsUrl, stretchesUrl } from "./pkayak";

/** Pause between two requests to the public service. */
export const KAYAK_CHECK_DELAY_MS = 2000;

/**
 * Who is asking: the project URL only, never a personal email. The same as
 * `prepare:spw-data`: the service answered 403 to `packraft-go-kayak-check (+...)`.
 */
const KAYAK_CHECK_USER_AGENT = "packraft-go (+https://github.com/elslander-cedric/packraft-go)";

/** The answers of one request per layer. Status 0 means no answer, with the reason as the body. */
export type KayakAnswers = {
  stretches: RecordedResponse;
  incidents: RecordedResponse;
  aires: RecordedResponse;
  obstacles: RecordedResponse;
};

type Report = Record<FindingLevel, (message: string) => void>;

type LayerName = keyof KayakAnswers;

/** The app's own queries: 5 and 0 as the page asks them, 3 and 1 as `prepare:spw-data` does. */
const LAYERS: readonly { key: LayerName; title: string; fixture: string; url: string }[] = [
  { key: "stretches", title: "layer 5 (stretches)", fixture: "layer5-stretches.json", url: stretchesUrl() },
  { key: "incidents", title: "layer 0 (incidents)", fixture: "layer0-incidents.json", url: incidentsUrl() },
  { key: "aires", title: "layer 3 (aires)", fixture: "layer3-aires.json", url: pkayakQuery(PKAYAK_LAYERS.aires, AIRE_FIELDS) },
  {
    key: "obstacles",
    title: "layer 1 (obstacles)",
    fixture: "layer1-obstacles.json",
    url: pkayakQuery(PKAYAK_LAYERS.obstacles, OBSTACLE_FIELDS),
  },
];

/**
 * A layer's records, read from either format: `f=json` lists its fields and has
 * `attributes`; `f=geojson` lists none and has `properties`, so its fields are the
 * records' keys and their types the values' (null when no record has a value).
 */
type Layer = { rows: Record<string, unknown>[]; fields: Map<string, string | null>; answer: PkayakAnswer };

function fieldsOfRows(rows: Record<string, unknown>[]): Layer["fields"] {
  const fields: Layer["fields"] = new Map();
  for (const row of rows) {
    for (const [name, value] of Object.entries(row)) {
      if (value !== null) fields.set(name, typeof value);
      else if (!fields.has(name)) fields.set(name, null);
    }
  }
  return fields;
}

/** The answer as a layer, or why it isn't one. An ArcGIS error comes with status 200. */
function readLayer(body: string): Layer | string {
  let json: { features?: unknown; fields?: unknown; error?: { message?: unknown } } | null;
  try {
    json = JSON.parse(body) as typeof json;
  } catch {
    return "answer is not JSON";
  }
  if (json?.error) return `ArcGIS error: ${JSON.stringify(json.error.message ?? json.error)}`;
  if (!Array.isArray(json?.features)) return "answer has no features";
  const features = json.features as { attributes?: Record<string, unknown>; properties?: Record<string, unknown> }[];
  const rows = features.map((f) => f.attributes ?? f.properties ?? {});
  const listed = json.fields as { name: string; type: string }[] | undefined;
  const fields = listed ? new Map(listed.map((f) => [f.name, f.type])) : fieldsOfRows(rows);
  return { rows, fields, answer: json as unknown as PkayakAnswer };
}

/** Whether every field the app relies on came back. */
function compareFields(title: string, live: Layer, recorded: Layer, report: Report): boolean {
  const missing = [...recorded.fields.keys()].filter((name) => !live.fields.has(name));
  if (missing.length > 0) report.mismatch(`${title}: no field ${missing.join(", ")} any more`);
  else report.match(`${title}: has ${[...recorded.fields.keys()].join(", ")}`);
  for (const [name, type] of recorded.fields) {
    const liveType = live.fields.get(name);
    if (type && liveType && liveType !== type) report.drift(`${title}: field ${name} is now ${liveType}, fixture has ${type}`);
  }
  const added = [...live.fields.keys()].filter((name) => !recorded.fields.has(name));
  if (added.length > 0) report.drift(`${title}: new field ${added.join(", ")}`);
  return missing.length === 0;
}

const stretchIds = ({ rows }: Layer) => rows.flatMap((row) => (typeof row.nomtro === "string" ? [row.nomtro] : []));

/** Whether the app has a meaning for a status code. It never reads an unknown one as open, but it loses the status. */
function isKnownStatus(code: string): boolean {
  const verdict = officialVerdict("stretch", { status: "ok", stretches: { stretch: { code } } });
  return verdict?.kind !== "unrecognised";
}

function compareStretches(live: Layer, recorded: Layer, report: Report) {
  const title = "layer 5 (stretches)";
  const unknown = live.rows.filter((row) => !isKnownStatus(String(row.stapub)));
  for (const row of unknown) {
    report.mismatch(`${title}: status code ${String(row.stapub)} on ${String(row.nomtro)}, which the app doesn't know: it reads as unknown`);
  }
  if (unknown.length === 0) {
    const codes = [...new Set(live.rows.map((row) => String(row.stapub)))].toSorted();
    report.match(`${title}: status codes ${codes.join(", ")} are all known`);
  }
  const [liveIds, recordedIds] = [stretchIds(live), stretchIds(recorded)];
  const added = liveIds.filter((id) => !recordedIds.includes(id));
  const gone = recordedIds.filter((id) => !liveIds.includes(id));
  if (added.length > 0) report.drift(`${title}: new official stretch ${added.join(", ")}`);
  if (gone.length > 0) report.drift(`${title}: official stretch gone: ${gone.join(", ")}`);
}

/** Any date: the snapshots built here are thrown away. */
const snapshotDate = dateInBrussels(0);

/** Runs one snapshot's own checks: the app is fine, but `prepare:spw-data` would stop here. */
function comparePreparation(title: string, build: () => unknown, report: Report) {
  try {
    build();
    report.match(`${title}: prepare:spw-data can build its snapshot from this`);
  } catch (error) {
    report.drift(`${title}: prepare:spw-data would refuse: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function compareObstacles(live: Layer, report: Report) {
  const title = "layer 1 (obstacles)";
  const isKnown = (code: unknown) => String(code) in OBSTACLE_KINDS;
  const unknown = [...new Set(live.rows.map((row) => row.codico).filter((code) => !isKnown(code)).map(String))];
  if (unknown.length > 0) {
    report.drift(`${title}: obstacle codes ${unknown.join(", ")} aren't shown by the app; prepare:spw-data refuses until that's decided`);
  } else {
    const codes = [...new Set(live.rows.map((row) => String(row.codico)))].toSorted((a, b) => Number(a) - Number(b));
    report.match(`${title}: obstacle codes ${codes.join(", ")} are all known`);
  }
  const features = live.answer.features.filter((feature) => isKnown(feature.properties.codico));
  comparePreparation(title, () => buildObstacles({ ...live.answer, features }, snapshotDate), report);
}

function compareAires(live: Layer, stretches: readonly string[], report: Report) {
  const known = { stretches: stretches.map((id) => ({ id, name: id })) };
  comparePreparation("layer 3 (aires)", () => buildOfficialAires(live.answer, known, snapshotDate), report);
}

/** What the app's adapter makes of the two layers it reads live: a record it drops is gone without a sound. */
async function compareAdapter(live: KayakAnswers, report: Report) {
  const source = createPkayakStatusSource({
    fetch: async (url) => {
      const { status, body } = url === stretchesUrl() ? live.stretches : live.incidents;
      return new Response(body, { status: status === 200 ? 200 : 503 });
    },
  });
  const [readings, incidents] = [await source.readings(), await source.incidents()];
  const compare = (what: string, read: number | null, total: unknown[]) => {
    if (read === null) report.mismatch(`adapter can't read the ${what}`);
    else if (read === total.length) report.match(`adapter reads ${read} of ${total.length} ${what}`);
    else report.mismatch(`adapter reads ${read} of ${total.length} ${what}`);
  };
  const rows = (answer: RecordedResponse) => {
    const layer = readLayer(answer.body);
    return typeof layer === "string" ? [] : layer.rows;
  };
  compare("stretches", readings.status === "ok" ? Object.keys(readings.stretches).length : null, rows(live.stretches));
  compare("incidents", incidents.status === "ok" ? incidents.incidents.length : null, rows(live.incidents));
}

/** Compares the live answers with the recorded ones, finding by finding. */
export async function compareWithFixture(live: KayakAnswers, recorded: KayakAnswers): Promise<Finding[]> {
  const findings: Finding[] = [];
  const report: Report = {
    match: (message) => findings.push({ level: "match", message }),
    drift: (message) => findings.push({ level: "drift", message }),
    mismatch: (message) => findings.push({ level: "mismatch", message }),
  };

  let stretches: readonly string[] = [];
  for (const { key, title } of LAYERS) {
    const fromRecording = readLayer(recorded[key].body);
    if (typeof fromRecording === "string") throw new Error(`recorded fixture is not a PKAYAK answer: ${fromRecording}`);
    if (key === "stretches") stretches = stretchIds(fromRecording);
    const answer = live[key];
    if (answer.status === 0) {
      report.mismatch(`${title}: no answer (${answer.body})`);
      continue;
    }
    if (answer.status !== recorded[key].status) {
      report.mismatch(`${title}: HTTP status ${answer.status}, fixture has ${recorded[key].status}`);
      continue;
    }
    const layer = readLayer(answer.body);
    if (typeof layer === "string") {
      report.mismatch(`${title}: ${layer}`);
      continue;
    }
    report.match(`${title}: HTTP status ${answer.status}, ${layer.rows.length} records`);
    if (layer.rows.length === 0 && key !== "incidents") {
      report.mismatch(`${title}: no records at all`);
      continue;
    }
    if (key !== "incidents" && layer.rows.length !== fromRecording.rows.length) {
      report.drift(`${title}: ${layer.rows.length} records, fixture has ${fromRecording.rows.length}`);
    }
    if (!compareFields(title, layer, fromRecording, report)) continue;
    if (key === "stretches") {
      compareStretches(layer, fromRecording, report);
      stretches = stretchIds(layer);
    }
    if (key === "aires") compareAires(layer, stretches, report);
    if (key === "obstacles") compareObstacles(layer, report);
  }
  await compareAdapter(live, report);
  return findings;
}

export type KayakCheckDeps = {
  fetch: (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
  wait: (ms: number) => Promise<void>;
  /** Reads a file from `src/kayak/fixtures/`. */
  readFixture: (name: string) => string;
};

export type KayakCheckResult = { passed: boolean; report: string };

/** Four requests, one at a time, no retries; one that fails doesn't stop the others. */
export async function runKayakCheck(deps: KayakCheckDeps): Promise<KayakCheckResult> {
  const answers: Partial<KayakAnswers> = {};
  const recorded: Partial<KayakAnswers> = {};
  for (const [i, { key, fixture, url }] of LAYERS.entries()) {
    recorded[key] = { status: 200, body: deps.readFixture(fixture) };
    if (i > 0) await deps.wait(KAYAK_CHECK_DELAY_MS);
    try {
      const response = await deps.fetch(url, { headers: { "User-Agent": KAYAK_CHECK_USER_AGENT } });
      answers[key] = { status: response.status, body: await response.text() };
    } catch (error) {
      answers[key] = { status: 0, body: error instanceof Error ? error.message : String(error) };
    }
  }
  const findings = await compareWithFixture(answers as KayakAnswers, recorded as KayakAnswers);

  const lines = ["", ...LAYERS.map(({ url }) => `  ${url}`), ""];
  for (const finding of findings) lines.push(`  ${finding.level.toUpperCase().padEnd(8)} ${finding.message}`);
  const mismatches = findings.filter((f) => f.level === "mismatch").length;
  const drifts = findings.filter((f) => f.level === "drift").length;

  lines.push("");
  if (mismatches > 0) lines.push(`FAILED: ${mismatches} mismatch(es). The live service no longer answers the way the app expects.`);
  else if (drifts > 0) lines.push(`PASSED with ${drifts} drift(s): the app still copes, but consider re-recording the fixtures or refreshing the snapshots.`);
  else lines.push("PASSED: the live service still matches the recorded fixtures.");
  return { passed: mismatches === 0, report: lines.join("\n") };
}
