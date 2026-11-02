// #216: which of the SPW's incidents apply on a date, and in which words.
import { describe, expect, it } from "vitest";
import { incidentsOn, incidentText, type Incident } from "./incident";

const incident = (over: Partial<Incident> = {}): Incident => ({
  id: "incident-1",
  spwId: 1,
  position: [5.5, 50.1],
  ...over,
});

describe("incidentsOn", () => {
  it("keeps an incident with no expiry on every date, however old it is", () => {
    const old = incident({ created: "2018-04-30" });
    expect(incidentsOn([old], "2026-11-02")).toEqual([old]);
    expect(incidentsOn([old], "2031-01-01")).toEqual([old]);
  });

  it("keeps an incident on its expiry date, and drops it from the day after", () => {
    const expiring = incident({ expires: "2026-11-02" });
    expect(incidentsOn([expiring], "2026-11-01")).toEqual([expiring]);
    expect(incidentsOn([expiring], "2026-11-02")).toEqual([expiring]);
    expect(incidentsOn([expiring], "2026-11-03")).toEqual([]);
  });
});

describe("incidentText", () => {
  it("reads the SPW's English text when there is one", () => {
    expect(incidentText(incident({ textEn: "River closed", textFr: "Rivière fermée" }))).toBe("River closed");
  });

  it("falls back to the French", () => {
    expect(incidentText(incident({ textFr: "Rivière fermée" }))).toBe("Rivière fermée");
  });

  it("has nothing to say when the SPW gives no text", () => {
    expect(incidentText(incident())).toBeUndefined();
  });
});
