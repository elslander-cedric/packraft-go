// #61: the AGW art. 6 flow rules on a Walloon stretch's gauge readings.
import { describe, expect, it } from "vitest";
import type { AgwRule } from "./access";
import { flowCheck, type FlowReadings, type GaugeReadings } from "./flow";

const today = "2026-10-14";
const rule = (over: Partial<AgwRule> = {}): AgwRule => ({
  type: "agw",
  category: "1.B",
  minM3s: 2.5,
  maxM3s: 44,
  gauge: { name: "Test gauge", stationNo: "1234", assumed: false },
  ...over,
});
const gauge = (
  mean72h: number,
  at8: number | null,
  meanDate = today,
): GaugeReadings => ({
  mean72h: [{ at: `${meanDate}T01:00:00.000+02:00`, m3s: mean72h }],
  hourly: [
    { at: `${today}T07:00:00.000+02:00`, m3s: 9 },
    ...(at8 === null ? [] : [{ at: `${today}T08:00:00.000+02:00`, m3s: at8 }]),
  ],
});
const ok = (g: GaugeReadings): FlowReadings => ({
  status: "ok",
  gauges: { "1234": g },
});

describe("flow check (AGW art. 6)", () => {
  it("is fine when the 72-hour mean is above the minimum and the 08:00 flow below the maximum", () => {
    const verdict = flowCheck(rule(), ok(gauge(5, 10)), today);
    expect(verdict.kind).toBe("ok");
    expect(verdict).toMatchObject({
      figures: {
        gauge: { name: "Test gauge" },
        minM3s: 2.5,
        maxM3s: 44,
        mean72h: { m3s: 5 },
        at8: { m3s: 10 },
        latest: { at: `${today}T08:00:00.000+02:00`, m3s: 10 },
      },
    });
  });

  it("closes on low flow: the 72-hour mean below the minimum", () => {
    expect(flowCheck(rule(), ok(gauge(2.4, 10)), today).kind).toBe("low");
    // Exactly the minimum is not below it.
    expect(flowCheck(rule(), ok(gauge(2.5, 10)), today).kind).toBe("ok");
  });

  it("closes on high flow: the hourly flow measured at 08:00 above the maximum", () => {
    expect(flowCheck(rule(), ok(gauge(5, 44.1)), today).kind).toBe("high");
    expect(flowCheck(rule(), ok(gauge(5, 44)), today).kind).toBe("ok");
  });

  it("has no low-flow closure on stretches without a minimum", () => {
    expect(
      flowCheck(rule({ minM3s: null }), ok(gauge(0.1, 3)), today).kind,
    ).toBe("ok");
  });

  it("is unknown when the 72-hour mean isn't from today (stale)", () => {
    const verdict = flowCheck(rule(), ok(gauge(5, 10, "2026-10-13")), today);
    expect(verdict).toMatchObject({
      kind: "unknown",
      why: "stale",
      figures: { mean72h: { m3s: 5 } },
    });
  });

  it("is unknown before the 08:00 flow is measured, unless the low flow closes it anyway", () => {
    expect(flowCheck(rule(), ok(gauge(5, null)), today)).toMatchObject({
      kind: "unknown",
      why: "not-measured-yet",
    });
    expect(flowCheck(rule(), ok(gauge(1, null)), today).kind).toBe("low");
  });

  it("ignores an 08:00 reading from another day", () => {
    const g: GaugeReadings = {
      mean72h: [{ at: `${today}T01:00:00.000+02:00`, m3s: 5 }],
      hourly: [{ at: "2026-10-13T08:00:00.000+02:00", m3s: 99 }],
    };
    expect(flowCheck(rule(), ok(g), today)).toMatchObject({
      kind: "unknown",
      why: "not-measured-yet",
    });
  });

  it("uses the latest 72-hour mean when there are several", () => {
    const g: GaugeReadings = {
      mean72h: [
        { at: "2026-10-13T01:00:00.000+02:00", m3s: 1 },
        { at: `${today}T01:00:00.000+02:00`, m3s: 5 },
      ],
      hourly: gauge(5, 10).hourly,
    };
    expect(flowCheck(rule(), ok(g), today).kind).toBe("ok");
  });

  it("is unknown when the service failed", () => {
    expect(flowCheck(rule(), { status: "failed" }, today)).toMatchObject({
      kind: "unknown",
      why: "failed",
    });
  });

  it("is unknown when the gauge's series are missing", () => {
    expect(
      flowCheck(rule(), { status: "ok", gauges: {} }, today),
    ).toMatchObject({ kind: "unknown", why: "missing" });
    const noMean: GaugeReadings = { mean72h: [], hourly: gauge(5, 10).hourly };
    expect(flowCheck(rule(), ok(noMean), today)).toMatchObject({
      kind: "unknown",
      why: "missing",
    });
  });

  it("is unknown without a matching gauge (Wanlin)", () => {
    expect(
      flowCheck(rule({ gauge: null }), ok(gauge(5, 10)), today),
    ).toMatchObject({ kind: "unknown", why: "no-gauge" });
    expect(flowCheck(rule({ gauge: null }), undefined, today)).toMatchObject({
      kind: "unknown",
      why: "no-gauge",
    });
  });

  it("is not checked when no readings were asked for yet", () => {
    expect(flowCheck(rule(), undefined, today).kind).toBe("not-checked");
  });
});
