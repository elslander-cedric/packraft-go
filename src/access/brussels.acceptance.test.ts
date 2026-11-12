// The built-in Brussels rules and locks.
import { describe, expect, it } from "vitest";
import { builtInDatasets, builtInLocks } from "./builtInRules";

describe("built-in Brussels rules and locks", () => {
  it("keeps Walloon and Brussels datasets side by side", () => {
    const ids = builtInDatasets.map((builtInDataset) => builtInDataset.id);
    expect(ids).toContain("wallonia");
    expect(ids).toContain("brussels");
  });
  it("locks exist only in Flanders and Brussels, include both named Brussels locks", () => {
    const regions = new Set(builtInLocks.locks.map((lock) => lock.region));
    expect([...regions].sort()).toEqual(["brussels", "flanders"]);
    const names = builtInLocks.locks
      .filter((lock) => lock.region === "brussels")
      .map((lock) => lock.name)
      .join("|");
    expect(names).toMatch(/Anderlecht/);
    expect(names).toMatch(/Molenbeek/);
  });
  it("every Brussels record has source url and a research date", () => {
    for (const record of builtInDatasets.find((builtInDataset) => builtInDataset.id === "brussels")!.records) {
      expect(record.source?.url, record.id).toMatch(/^https:\/\//);
      expect(record.researched, record.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
