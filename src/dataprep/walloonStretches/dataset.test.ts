// #205: where the app's gauge isn't Annex 2's, the assembly of the dataset says so,
// so rebuilding the stretches keeps Hérock.
import { describe, expect, it } from "vitest";
import type { DraftStretch } from "./build";
import { toDataset } from "./dataset";

const draft = (annex2Gauge: string) => ({ id: "x", annex2Gauge }) as unknown as DraftStretch;
const shipped = (annex2Gauge: string) => toDataset([draft(annex2Gauge)]).stretches[0]!;

describe("the shipped gauge of a stretch", () => {
  it("is the Annex 2 gauge's KiWIS station", () => {
    expect(shipped("Stavelot").gauge).toEqual({ name: "Stavelot", stationNo: "6732", assumed: false });
  });

  it("is Hérock where Annex 2 names Wanlin, marked as SPW practice", () => {
    const stretch = shipped("Wanlin");
    expect(stretch.gauge).toEqual({ name: "Hérock", stationNo: "L6610", assumed: false, spwPractice: true });
    expect(stretch.noGaugeNote).toBeUndefined();
  });

  it("is none, with a note, for a name with no station", () => {
    const stretch = shipped("Nowhere");
    expect(stretch.gauge).toBeNull();
    expect(stretch.noGaugeNote).toMatch(/Nowhere/);
  });
});
