// The live PKAYAK check's comparison logic, tested offline against the recorded
// fixtures. No test here calls the network (ADR 0019).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AIRE_FIELDS, OBSTACLE_FIELDS, PKAYAK_LAYERS, pkayakQuery } from "@/access/prepare/spw";
import { compareWithFixture, KAYAK_CHECK_DELAY_MS, runKayakCheck, type KayakAnswers } from "./liveCheck";
import { incidentsUrl, stretchesUrl } from "./pkayak";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const answer = (name: string) => ({ status: 200, body: fixture(name) });
const recorded: KayakAnswers = {
  stretches: answer("layer5-stretches.json"),
  incidents: answer("layer0-incidents.json"),
  aires: answer("layer3-aires.json"),
  obstacles: answer("layer1-obstacles.json"),
};

const findings = (live: Partial<KayakAnswers>) => compareWithFixture({ ...recorded, ...live }, recorded);
const atLevel = async (level: string, live: Partial<KayakAnswers>) =>
  (await findings(live)).filter((f) => f.level === level).map((f) => f.message);

describe("PKAYAK contract check: the answers themselves", () => {
  it("finds nothing wrong with the recorded answers", async () => {
    expect(new Set((await findings({})).map((f) => f.level))).toEqual(new Set(["match"]));
  });

  it("reports a layer that answers with another HTTP status", async () => {
    expect(await atLevel("mismatch", { aires: { status: 503, body: "busy" } })).toContainEqual(
      expect.stringMatching(/layer 3.*503/),
    );
  });

  it("reports the error ArcGIS sends inside a 200, as for a field that doesn't exist", async () => {
    const body = JSON.stringify({ error: { code: 400, message: "Failed to execute query." } });
    expect(await atLevel("mismatch", { stretches: { status: 200, body } })).toContainEqual(
      expect.stringMatching(/layer 5.*Failed to execute query/),
    );
  });

  it("reports an answer that isn't JSON", async () => {
    expect(await atLevel("mismatch", { obstacles: { status: 200, body: "<html>" } })).toContainEqual(
      expect.stringMatching(/layer 1.*not JSON/),
    );
  });

  it("reports a layer that didn't answer at all", async () => {
    expect(await atLevel("mismatch", { incidents: { status: 0, body: "timed out" } })).toContainEqual(
      expect.stringMatching(/layer 0.*timed out/),
    );
  });
});

type Rows = {
  features: { attributes?: Record<string, unknown>; properties?: Record<string, unknown> }[];
  fields?: { name: string; type: string }[];
};
const edited = (name: string, edit: (layer: Rows) => void) => {
  const layer = JSON.parse(fixture(name)) as Rows;
  edit(layer);
  return { status: 200, body: JSON.stringify(layer) };
};
const editedStretches = (edit: (layer: Rows) => void) => edited("layer5-stretches.json", edit);
const editedIncidents = (edit: (layer: Rows) => void) => edited("layer0-incidents.json", edit);
const editedAires = (edit: (layer: Rows) => void) => edited("layer3-aires.json", edit);
const editedObstacles = (edit: (layer: Rows) => void) => edited("layer1-obstacles.json", edit);

describe("PKAYAK contract check: fields", () => {
  it("calls a field the app reads from layer 5 or 0 and no longer gets a mismatch", async () => {
    const stretches = editedStretches((l) => {
      l.fields = l.fields?.filter((f) => f.name !== "justif");
    });
    expect(await atLevel("mismatch", { stretches })).toContainEqual(expect.stringMatching(/layer 5.*justif/));
    const incidents = editedIncidents((l) => {
      l.fields = l.fields?.filter((f) => f.name !== "datexp");
    });
    expect(await atLevel("mismatch", { incidents })).toContainEqual(expect.stringMatching(/layer 0.*datexp/));
  });

  it("calls a field missing from the records of a geojson layer a mismatch", async () => {
    const aires = editedAires((l) => l.features.forEach((f) => delete f.properties?.typemb));
    expect(await atLevel("mismatch", { aires })).toContainEqual(expect.stringMatching(/layer 3.*typemb/));
    const obstacles = editedObstacles((l) => l.features.forEach((f) => delete f.properties?.codico));
    expect(await atLevel("mismatch", { obstacles })).toContainEqual(expect.stringMatching(/layer 1.*codico/));
  });

  it("calls a field of another type drift", async () => {
    const stretches = editedStretches((l) => {
      l.fields = l.fields?.map((f) => (f.name === "stapub" ? { ...f, type: "esriFieldTypeInteger" } : f));
    });
    expect(await atLevel("drift", { stretches })).toContainEqual(
      expect.stringMatching(/layer 5.*stapub.*esriFieldTypeInteger/),
    );
    const aires = editedAires((l) => l.features.forEach((f) => (f.properties!.datmod = "2026-01-01")));
    expect(await atLevel("drift", { aires })).toContainEqual(expect.stringMatching(/layer 3.*datmod.*string/));
  });

  it("doesn't take a field that is empty on every record for a change", async () => {
    const aires = editedAires((l) => l.features.forEach((f) => (f.properties!.datmod = null)));
    expect((await atLevel("drift", { aires })).filter((m) => /datmod.*type/.test(m))).toEqual([]);
  });

  it("calls a field the app didn't ask for drift", async () => {
    const stretches = editedStretches((l) => {
      l.fields = [...(l.fields ?? []), { name: "nouveau", type: "esriFieldTypeString" }];
    });
    expect(await atLevel("drift", { stretches })).toContainEqual(expect.stringMatching(/layer 5.*nouveau/));
  });

  it("calls an empty layer a mismatch, except incidents, which come and go", async () => {
    const aires = editedAires((l) => {
      l.features = [];
    });
    expect(await atLevel("mismatch", { aires })).toContainEqual(expect.stringMatching(/layer 3.*no records/));
    const incidents = editedIncidents((l) => {
      l.features = [];
    });
    expect(await atLevel("mismatch", { incidents })).toEqual([]);
  });
});

describe("PKAYAK contract check: codes", () => {
  it("accepts every status code the app knows, not only the recorded ones", async () => {
    const stretches = editedStretches((l) => {
      ["0", "1", "2", "3", "4", "5"].forEach((code, i) => (l.features[i].attributes!.stapub = code));
    });
    expect(await atLevel("mismatch", { stretches })).toEqual([]);
  });

  it("calls a status code the app doesn't know a mismatch and names its stretch", async () => {
    const stretches = editedStretches((l) => {
      l.features[0].attributes!.stapub = "7";
    });
    expect(await atLevel("mismatch", { stretches })).toContainEqual(expect.stringMatching(/status code 7.*SEMOIS2-3/));
  });

  it("calls an obstacle code the app doesn't show drift: the shipped snapshot still stands", async () => {
    const obstacles = editedObstacles((l) => {
      l.features[0].properties!.codico = "9";
      l.features[1].properties!.codico = "12";
    });
    expect(await atLevel("mismatch", { obstacles })).toEqual([]);
    expect(await atLevel("drift", { obstacles })).toEqual([expect.stringMatching(/obstacle codes? 9, 12.*prepare:spw-data/)]);
  });

  it("calls an aire type the snapshot can't take drift", async () => {
    const aires = editedAires((l) => {
      l.features[0].properties!.typemb = "X";
    });
    expect(await atLevel("mismatch", { aires })).toEqual([]);
    expect(await atLevel("drift", { aires })).toContainEqual(expect.stringMatching(/prepare:spw-data.*unknown type "X"/));
  });

  it("calls an aire on a stretch layer 5 doesn't list drift", async () => {
    const aires = editedAires((l) => {
      l.features[0].properties!.nomtro = "NOUVEAU";
    });
    expect(await atLevel("drift", { aires })).toContainEqual(expect.stringMatching(/prepare:spw-data.*NOUVEAU/));
  });
});

describe("PKAYAK contract check: records", () => {
  it("calls a stretch that came or went drift and names it", async () => {
    const stretches = editedStretches((l) => {
      l.features[0].attributes!.nomtro = "NOUVEAU";
    });
    expect(await atLevel("mismatch", { stretches })).toEqual([]);
    const drift = await atLevel("drift", { stretches });
    expect(drift).toContainEqual(expect.stringMatching(/new official stretch.*NOUVEAU/));
    expect(drift).toContainEqual(expect.stringMatching(/official stretch.*gone.*SEMOIS2-3/));
  });

  it("calls another number of aires or obstacles drift: time to refresh the snapshot", async () => {
    const aires = editedAires((l) => {
      l.features.pop();
    });
    expect(await atLevel("drift", { aires })).toContainEqual(expect.stringMatching(/layer 3.*91 records, fixture has 92/));
  });

  it("takes incidents coming and going as normal", async () => {
    const incidents = editedIncidents((l) => {
      l.features.pop();
    });
    expect(await atLevel("drift", { incidents })).toEqual([]);
  });

  it("calls an answer cut off by the record limit drift on a snapshot layer", async () => {
    const aires = { status: 200, body: JSON.stringify({ ...JSON.parse(fixture("layer3-aires.json")), exceededTransferLimit: true }) };
    expect(await atLevel("drift", { aires })).toContainEqual(expect.stringMatching(/cut off/));
  });
});

describe("PKAYAK contract check: the app's adapter", () => {
  it("reports what it reads from today's answers", async () => {
    const messages = (await findings({})).map((f) => f.message);
    expect(messages).toContainEqual(expect.stringMatching(/adapter reads 21 of 21 stretches/));
    expect(messages).toContainEqual(expect.stringMatching(/adapter reads 3 of 3 incidents/));
  });

  it("calls incidents the adapter silently drops a mismatch", async () => {
    const incidents = editedIncidents((l) => {
      l.features.forEach((f) => (f.attributes!.id = `incident-${String(f.attributes!.id)}`));
    });
    expect(await atLevel("mismatch", { incidents })).toContainEqual(expect.stringMatching(/adapter reads 0 of 3 incidents/));
  });

  it("calls stretches the adapter silently drops a mismatch", async () => {
    const stretches = editedStretches((l) => {
      l.features[0].attributes!.nomtro = null;
    });
    expect(await atLevel("mismatch", { stretches })).toContainEqual(expect.stringMatching(/adapter reads 20 of 21 stretches/));
  });
});

describe("the PKAYAK check run", () => {
  const replay = () => {
    const calls: { url: string; userAgent: string }[] = [];
    const deps = {
      fetch: async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ url, userAgent: init.headers["User-Agent"] });
        const layer = /MapServer\/(\d)\/query/.exec(url)?.[1];
        const name = { "0": "layer0-incidents", "1": "layer1-obstacles", "3": "layer3-aires", "5": "layer5-stretches" }[layer ?? ""];
        return new Response(fixture(`${name}.json`), { status: 200 });
      },
      wait: vi.fn(async () => {}),
      readFixture: fixture,
    };
    return { calls, deps };
  };

  it("passes on the recorded answers", async () => {
    const result = await runKayakCheck(replay().deps);
    expect(result.passed).toBe(true);
    expect(result.report).toContain("PASSED: the live service still matches the recorded fixtures.");
  });

  it("asks the app's own queries, one per layer, with a pause between them", async () => {
    const { calls, deps } = replay();
    await runKayakCheck(deps);
    expect(calls.map((c) => c.url)).toEqual([
      stretchesUrl(),
      incidentsUrl(),
      pkayakQuery(PKAYAK_LAYERS.aires, AIRE_FIELDS),
      pkayakQuery(PKAYAK_LAYERS.obstacles, OBSTACLE_FIELDS),
    ]);
    expect(deps.wait.mock.calls).toEqual([[KAYAK_CHECK_DELAY_MS], [KAYAK_CHECK_DELAY_MS], [KAYAK_CHECK_DELAY_MS]]);
  });

  it("identifies itself with the project URL only", async () => {
    const { calls, deps } = replay();
    await runKayakCheck(deps);
    expect(calls[0].userAgent).toBe("packraft-go (+https://github.com/elslander-cedric/packraft-go)");
  });

  it("fails on a mismatch and says so, with the finding in the report", async () => {
    const { deps } = replay();
    const result = await runKayakCheck({
      ...deps,
      fetch: async (url, init) =>
        url === stretchesUrl() ? new Response(JSON.stringify({ error: { message: "Failed to execute query." } })) : deps.fetch(url, init),
    });
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/MISMATCH.*Failed to execute query/);
    expect(result.report).toContain("FAILED");
  });

  it("passes on drift alone and says to look at it", async () => {
    const { deps } = replay();
    const result = await runKayakCheck({
      ...deps,
      fetch: async (url, init) =>
        url.includes("/1/query") ? new Response(editedObstacles((l) => void l.features.pop()).body) : deps.fetch(url, init),
    });
    expect(result.passed).toBe(true);
    expect(result.report).toMatch(/DRIFT.*95 records, fixture has 96/);
    expect(result.report).toContain("PASSED with 1 drift(s)");
  });

  it("carries on after a request that fails, and counts it as a mismatch", async () => {
    const { calls, deps } = replay();
    const result = await runKayakCheck({
      ...deps,
      fetch: async (url, init) => {
        if (url === incidentsUrl()) throw new Error("connection reset");
        return deps.fetch(url, init);
      },
    });
    expect(result.passed).toBe(false);
    expect(result.report).toMatch(/layer 0.*connection reset/);
    expect(calls).toHaveLength(3);
  });

  it("never touches the global fetch, so it needs no network here", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await runKayakCheck(replay().deps);
    vi.unstubAllGlobals();
    expect(spy).not.toHaveBeenCalled();
  });
});
