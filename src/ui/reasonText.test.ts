// #210: how a reason's rule text and the SPW's official verdict read together.
import { describe, expect, it } from "vitest";
import type { AccessReason, AccessState } from "@/core/access";
import type { OfficialVerdict } from "@/core/officialStatus";
import { notCheckedText, reasonText } from "./reasonText";

type RuleReason = Extract<AccessReason, { kind: "rule" }>;

const reason = (state: AccessState, official?: OfficialVerdict, extra: Partial<RuleReason> = {}): RuleReason => ({
  kind: "rule",
  state,
  recordId: "r",
  name: "Test",
  ruleText: "Rule text.",
  source: { title: "s", url: "https://example.org" },
  researched: "2026-11-02",
  ...(official && { official }),
  ...extra,
});

describe("a reason's text", () => {
  it("is the rule text without an official verdict", () => {
    expect(reasonText(reason("open"))).toBe("Rule text.");
  });

  it("gives the SPW's reason on a closed stretch, in its own words", () => {
    const text = reasonText(
      reason("closed-today", { kind: "closed", cause: "too-low-or-stated", reason: "Rivière non sécurisée" }, { closedBy: "official" }),
    );
    expect(text).toBe("Closed today by the SPW: Rivière non sécurisée");
  });

  it("says too low when the SPW gives code 0 and no reason", () => {
    const text = reasonText(reason("closed-today", { kind: "closed", cause: "too-low-or-stated" }, { closedBy: "official" }));
    expect(text).toBe("Closed today by the SPW: the water is too low.");
  });

  it("reads high water and out of season as such, with any reason after", () => {
    const high = reason("closed-today", { kind: "closed", cause: "high-water" }, { closedBy: "official" });
    expect(reasonText(high)).toBe("Closed today by the SPW: high water.");
    const season = reason("closed-today", { kind: "closed", cause: "out-of-season", reason: "Hiver" }, { closedBy: "official" });
    expect(reasonText(season)).toBe("Closed today by the SPW: out of season. Hiver");
  });

  it("gives a calendar closure first, then the SPW's own", () => {
    const text = reasonText(
      reason("closed-today", { kind: "closed", cause: "too-low-or-stated", reason: "Travaux" }, { closedBy: "fishing-day" }),
    );
    expect(text).toBe("Rule text. Closed today by the SPW: Travaux");
  });

  it("says an open stretch is officially open", () => {
    expect(reasonText(reason("open", { kind: "open" }))).toBe("Open today, says the SPW. Rule text.");
  });

  it("shows the code 2 note on an open stretch", () => {
    expect(reasonText(reason("open", { kind: "open", soon: true }))).toBe(
      "Open today, says the SPW, but kayaks may soon be forbidden. Rule text.",
    );
  });

  it("claims nothing official when a calendar closure beats an official open", () => {
    expect(reasonText(reason("closed-today", { kind: "open" }, { closedBy: "fishing-day" }))).toBe("Rule text.");
  });

  it("says when the SPW gives a code the app doesn't know", () => {
    expect(reasonText(reason("unknown", { kind: "unrecognised", code: "9" }))).toContain("code 9");
    expect(reasonText(reason("unknown", { kind: "unrecognised", code: "9" }))).not.toContain("Rule text.");
  });

  it("says no official status exists for a record with no official stretch", () => {
    expect(reasonText(reason("open", { kind: "none" }))).toBe("Rule text. The SPW publishes no official status for this stretch.");
  });

  it("adds the note after the rule text on a future date, with the SPW's reason", () => {
    const text = reasonText(
      reason("open", undefined, { closedToday: { kind: "closed", cause: "too-low-or-stated", reason: "Arrêté ministériel" } }),
    );
    expect(text).toBe("Rule text. Officially closed today, says the SPW: Arrêté ministériel");
  });

  it("words the note's cause like a closure's, when the SPW gives no reason", () => {
    const low = reason("open", undefined, { closedToday: { kind: "closed", cause: "too-low-or-stated" } });
    expect(reasonText(low)).toBe("Rule text. Officially closed today, says the SPW: the water is too low.");
    const high = reason("open", undefined, { closedToday: { kind: "closed", cause: "high-water", reason: "Crue" } });
    expect(reasonText(high)).toBe("Rule text. Officially closed today, says the SPW: high water. Crue");
  });

  it("leaves an unavailable official status to the note that goes with it", () => {
    expect(reasonText(reason("open", { kind: "unavailable" }))).toBe("Rule text.");
  });
});

describe("the note on what wasn't checked with the SPW (#211)", () => {
  it("is empty when everything was checked", () => {
    expect(notCheckedText([])).toBe("");
  });

  it("says official closures weren't checked", () => {
    expect(notCheckedText(["closures"])).toBe("Official closures weren't checked, so the SPW may have closed this stretch.");
  });
});
