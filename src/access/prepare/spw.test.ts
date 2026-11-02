// The offline preparation of the SPW snapshots (ADR 0035): what the script makes of
// PKAYAK answers. Never calls the service.
import { describe, expect, it } from "vitest";
import { buildObstacles, buildOfficialAires, buildOfficialStretches, pkayakQuery, type PkayakAnswer } from "./spw";

const SNAPSHOT = "2026-11-02";

const stretchAnswer: PkayakAnswer = {
  features: [
    { properties: { nomtro: "SEMOIS2-3", adrtro: "La Semois, de Chiny jusqu'au pont de Linglé" } },
    { properties: { nomtro: "LESSE2", adrtro: "La Lesse, de Daverdisse à Chanly" } },
  ],
};
const stretches = buildOfficialStretches(stretchAnswer, SNAPSHOT);

const aire = (overrides: Record<string, unknown> = {}) => ({
  geometry: { type: "Point", coordinates: [5.1532432501, 50.0784719626] },
  properties: {
    numemb: 7,
    nomtro: "LESSE2",
    nomair: "Aire de Chanly",
    typemb: "D",
    datmod: Date.UTC(2016, 4, 2, 14, 18),
    ...overrides,
  },
});
const aires = (...features: PkayakAnswer["features"]) => buildOfficialAires({ features }, stretches, SNAPSHOT);

describe("official aires", () => {
  it("keeps the SPW's number, French name, stretch and position, rounded for a small diff", () => {
    expect(aires(aire()).aires).toEqual([
      {
        number: 7,
        name: "Aire de Chanly",
        use: "take-out",
        officialStretch: "LESSE2",
        position: [5.15324, 50.07847],
        lastChanged: "2016-05-02",
      },
    ]);
  });

  it.each([
    ["E", "put-in"],
    ["D", "take-out"],
    ["ED", "both"],
    ["NA", "both"],
  ])("maps SPW type %s to %s", (typemb, use) => {
    expect(aires(aire({ typemb })).aires[0].use).toBe(use);
  });

  it.each(["X", "", "e", null])("fails on SPW type %s", (typemb) => {
    expect(() => aires(aire({ typemb }))).toThrow(/aire 7.*type/i);
  });

  it("dates a last change in Brussels time, so it can't move a day", () => {
    // 23:30 UTC on 30 June 2016 is already 1 July in Brussels.
    expect(aires(aire({ datmod: Date.UTC(2016, 5, 30, 23, 30) })).aires[0].lastChanged).toBe("2016-07-01");
  });

  it("records the snapshot's source and date once, and sorts by number so a refresh diffs well", () => {
    const dataset = aires(aire({ numemb: 9 }), aire({ numemb: 2 }));
    expect(dataset.aires.map((a) => a.number)).toEqual([2, 9]);
    expect(dataset.snapshot).toBe(SNAPSHOT);
    expect(dataset.source.url).toMatch(/^https:\/\/.*PKAYAK\/MapServer\/3$/);
  });

  it("fails on an aire whose stretch isn't an official stretch", () => {
    expect(() => aires(aire({ nomtro: "NOPE" }))).toThrow(/aire 7.*NOPE/i);
  });

  it("fails on a repeated number, a missing name, a missing date or no position", () => {
    expect(() => aires(aire(), aire())).toThrow(/aire 7.*twice/i);
    expect(() => aires(aire({ nomair: " " }))).toThrow(/aire 7.*name/i);
    expect(() => aires(aire({ datmod: null }))).toThrow(/aire 7.*date/i);
    expect(() => aires({ ...aire(), geometry: null })).toThrow(/aire 7.*position/i);
  });

  it("fails on a cut-off answer rather than ship part of the list", () => {
    expect(() => buildOfficialAires({ features: [aire()], exceededTransferLimit: true }, stretches, SNAPSHOT)).toThrow(
      /cut off/i,
    );
  });
});

describe("official stretches", () => {
  it("keeps each stretch's id and French name, sorted, with no line", () => {
    expect(stretches.stretches).toEqual([
      { id: "LESSE2", name: "La Lesse, de Daverdisse à Chanly" },
      { id: "SEMOIS2-3", name: "La Semois, de Chiny jusqu'au pont de Linglé" },
    ]);
    expect(stretches.snapshot).toBe(SNAPSHOT);
    expect(stretches.source.url).toMatch(/PKAYAK\/MapServer\/5$/);
  });

  it("fails on a stretch with no name or a repeated id", () => {
    const stretch = stretchAnswer.features[0];
    expect(() => buildOfficialStretches({ features: [{ properties: { nomtro: "X", adrtro: null } }] }, SNAPSHOT)).toThrow(
      /X.*name/i,
    );
    expect(() => buildOfficialStretches({ features: [stretch, stretch] }, SNAPSHOT)).toThrow(/SEMOIS2-3.*twice/i);
  });
});

describe("obstacles", () => {
  const obstacle = (overrides: Record<string, unknown> = {}) => ({
    geometry: { type: "Point", coordinates: [4.972388358810162, 49.846021160855486] },
    properties: { id: 111, codico: "2", datmod: Date.UTC(2023, 0, 16, 16, 23), ...overrides },
  });
  const obstacles = (...features: PkayakAnswer["features"]) => buildObstacles({ features }, SNAPSHOT);

  it("keeps the SPW's id, the kind, the position rounded for a small diff, and the last-changed date", () => {
    expect(obstacles(obstacle()).obstacles).toEqual([
      { spwId: 111, kind: "dam", position: [4.97239, 49.84602], lastChanged: "2023-01-16" },
    ]);
  });

  it.each([
    ["2", "dam"],
    ["15", "impassable"],
    ["8", "rocks"],
    ["21", "drossage"],
    ["22", "low-bridge"],
  ])("maps SPW code %s to %s", (codico, kind) => {
    expect(obstacles(obstacle({ codico })).obstacles[0].kind).toBe(kind);
  });

  // Codes on the layer's own legend that are not obstacles today, among others.
  it.each(["1", "4", "12", "16", "", null])("fails on SPW code %s", (codico) => {
    expect(() => obstacles(obstacle({ codico }))).toThrow(/obstacle 111.*code/i);
  });

  it("takes the kind from the code alone, not from the SPW's name fields", () => {
    const named = obstacle({ codico: "21", nomofr: "Barrage", nomoen: "Rocks" });
    expect(obstacles(named).obstacles[0].kind).toBe("drossage");
  });

  it("dates a last change in Brussels time, so it can't move a day", () => {
    // 23:30 UTC on 30 June 2016 is already 1 July in Brussels.
    expect(obstacles(obstacle({ datmod: Date.UTC(2016, 5, 30, 23, 30) })).obstacles[0].lastChanged).toBe("2016-07-01");
  });

  it("records the snapshot's source and date once, and sorts by id so a refresh diffs well", () => {
    const dataset = obstacles(obstacle({ id: 150 }), obstacle({ id: 53 }));
    expect(dataset.obstacles.map((o) => o.spwId)).toEqual([53, 150]);
    expect(dataset.snapshot).toBe(SNAPSHOT);
    expect(dataset.source.title).toMatch(/SPW/);
    expect(dataset.source.url).toMatch(/^https:\/\/.*PKAYAK\/MapServer\/1$/);
    expect(dataset.attribution).toMatch(/Service public de Wallonie/);
  });

  it("fails on a missing id, a repeated id, a missing date or no position", () => {
    expect(() => obstacles(obstacle({ id: null }))).toThrow(/no id/i);
    expect(() => obstacles(obstacle(), obstacle())).toThrow(/obstacle 111.*twice/i);
    expect(() => obstacles(obstacle({ datmod: null }))).toThrow(/obstacle 111.*date/i);
    expect(() => obstacles({ ...obstacle(), geometry: null })).toThrow(/obstacle 111.*position/i);
  });

  it("fails on a cut-off answer rather than ship part of the list", () => {
    expect(() => buildObstacles({ features: [obstacle()], exceededTransferLimit: true }, SNAPSHOT)).toThrow(/cut off/i);
  });
});

describe("the PKAYAK query", () => {
  it("asks one layer for only the fields it needs, in WGS84 GeoJSON", () => {
    const url = new URL(pkayakQuery(3, ["numemb", "typemb"]));
    expect(url.pathname).toMatch(/\/PKAYAK\/MapServer\/3\/query$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      where: "1=1",
      outFields: "numemb,typemb",
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
    });
  });

  it("can leave the geometry out", () => {
    expect(new URL(pkayakQuery(5, ["nomtro"], { geometry: false })).searchParams.get("returnGeometry")).toBe("false");
  });
});
