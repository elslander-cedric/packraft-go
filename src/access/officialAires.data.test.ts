// Checks on the built-in SPW snapshots (ADR 0035): every official aire and obstacle is
// usable as it ships, whatever a refresh brought in.
import { describe, expect, it } from "vitest";
import { regionsAt } from "@/core/access";
import { accessPointUses } from "@/core/accessPoints";
import { obstacleKinds } from "@/core/obstacle";
import {
  builtInAccessRules,
  builtInLocks,
  builtInObstacles,
  builtInOfficialAires,
  builtInOfficialStretches,
} from "./builtInRules";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const stretchIds = new Set(builtInOfficialStretches.stretches.map((s) => s.id));

describe("built-in official aires", () => {
  it("are the SPW's 92, once each, with ids of their own", () => {
    expect(builtInOfficialAires).toHaveLength(92);
    const ids = new Set(builtInOfficialAires.map((a) => a.id));
    expect(ids.size).toBe(92);
    for (const lock of builtInLocks.locks) expect(ids.has(lock.id)).toBe(false);
    for (const record of builtInAccessRules.records) expect(ids.has(record.id)).toBe(false);
  });

  it("every aire has a name, a known use and a last-changed date", () => {
    for (const aire of builtInOfficialAires) {
      expect(aire.name, aire.id).not.toBe("");
      expect(accessPointUses, aire.id).toContain(aire.use);
      expect(aire.lastChanged, aire.id).toMatch(DATE);
    }
  });

  it("the three uses all occur, with NA read as both", () => {
    const count = (use: string) => builtInOfficialAires.filter((a) => a.use === use).length;
    expect([count("put-in"), count("take-out"), count("both")]).toEqual([22, 15, 55]);
  });

  it("every aire is on a known official stretch", () => {
    expect(builtInOfficialAires.filter((a) => !stretchIds.has(a.officialStretch))).toEqual([]);
  });

  it("every aire has a position in Wallonia", () => {
    const outside = builtInOfficialAires.filter(
      ({ position: [lng, lat] }) => !regionsAt({ lat, lng }, builtInAccessRules).includes("wallonia"),
    );
    expect(outside).toEqual([]);
  });

  it("every aire carries the snapshot's source and date", () => {
    for (const aire of builtInOfficialAires) {
      expect(aire.source.title, aire.id).toMatch(/SPW/);
      expect(aire.source.url, aire.id).toMatch(/^https:\/\//);
      expect(aire.snapshot, aire.id).toMatch(DATE);
    }
  });
});

describe("built-in obstacles", () => {
  it("are the SPW's 96, once each, with ids of their own", () => {
    expect(builtInObstacles).toHaveLength(96);
    const ids = new Set(builtInObstacles.map((o) => o.id));
    expect(ids.size).toBe(96);
    for (const aire of builtInOfficialAires) expect(ids.has(aire.id)).toBe(false);
    for (const lock of builtInLocks.locks) expect(ids.has(lock.id)).toBe(false);
    for (const record of builtInAccessRules.records) expect(ids.has(record.id)).toBe(false);
  });

  it("every obstacle has a known kind and a last-changed date", () => {
    for (const obstacle of builtInObstacles) {
      expect(obstacleKinds, obstacle.id).toContain(obstacle.kind);
      expect(obstacle.lastChanged, obstacle.id).toMatch(DATE);
    }
  });

  it("the five kinds occur as the SPW counted them on 2026-11-02", () => {
    const count = (kind: string) => builtInObstacles.filter((o) => o.kind === kind).length;
    expect(obstacleKinds.map(count)).toEqual([45, 12, 12, 20, 7]);
  });

  it("every obstacle has a position in Wallonia", () => {
    const outside = builtInObstacles.filter(
      ({ position: [lng, lat] }) => !regionsAt({ lat, lng }, builtInAccessRules).includes("wallonia"),
    );
    // The SPW's one exception: a drossage on the Sûre, where the river is the border,
    // 18 m outside the region's simplified outline.
    expect(outside.map((o) => o.spwId)).toEqual([133]);
  });

  it("every obstacle carries the snapshot's source and date", () => {
    for (const obstacle of builtInObstacles) {
      expect(obstacle.source.title, obstacle.id).toMatch(/SPW/);
      expect(obstacle.source.url, obstacle.id).toMatch(/^https:\/\//);
      expect(obstacle.snapshot, obstacle.id).toMatch(DATE);
    }
  });
});

describe("built-in official stretches", () => {
  it("are the SPW's 21, each with a name, and the snapshot's source and date, and no line", () => {
    expect(builtInOfficialStretches.stretches).toHaveLength(21);
    for (const stretch of builtInOfficialStretches.stretches) {
      expect(Object.keys(stretch).toSorted()).toEqual(["id", "name"]);
      expect(stretch.name, stretch.id).not.toBe("");
    }
    expect(builtInOfficialStretches.source.url).toMatch(/^https:\/\//);
    expect(builtInOfficialStretches.snapshot).toMatch(DATE);
    expect(builtInOfficialStretches.attribution).toMatch(/Service public de Wallonie/);
  });
});
