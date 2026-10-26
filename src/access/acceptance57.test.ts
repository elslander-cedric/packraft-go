// Acceptance checks for #57 (Brussels rules and locks).
import { describe, expect, it } from "vitest";
import { builtInDatasets, builtInLocks } from "./builtInRules";

describe("#57", () => {
  it("keeps Walloon and Brussels datasets side by side", () => {
    const ids = builtInDatasets.map((d) => d.id);
    expect(ids).toContain("wallonia");
    expect(ids).toContain("brussels");
  });
  it("locks exist only in Flanders and Brussels, include both named Brussels locks", () => {
    const regions = new Set(builtInLocks.locks.map((l) => l.region));
    expect([...regions].sort()).toEqual(["brussels", "flanders"]);
    const names = builtInLocks.locks
      .filter((l) => l.region === "brussels")
      .map((l) => l.name)
      .join("|");
    expect(names).toMatch(/Anderlecht/);
    expect(names).toMatch(/Molenbeek/);
  });
  it("every Brussels record has source url and a research date", () => {
    for (const r of builtInDatasets.find((d) => d.id === "brussels")!.records) {
      expect(r.source?.url, r.id).toMatch(/^https:\/\//);
      expect(r.researched, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
