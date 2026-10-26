// How an access point is shown in a list, a marker and a snap offer (#136):
// the name leads, else the note's first line, else its use and kind.
import { describe, expect, it } from "vitest";
import type { AccessPoint } from "@/core/accessPoints";
import { accessPointText } from "./accessPointText";

const point: AccessPoint = {
  id: "a",
  position: { lat: 50.268, lng: 5.446 },
  name: "",
  nameSource: "default",
  use: "put-in",
  kind: "slipway",
  note: "",
  checkedOnSite: null,
  createdAt: "2026-10-13T08:00:00.000Z",
  updatedAt: "2026-10-13T08:00:00.000Z",
};

describe("access point text", () => {
  it("leads with the name, then the whole note, then use and kind as a detail", () => {
    expect(accessPointText({ ...point, name: "Hotton bridge", note: "Steep bank\nPark at the church" })).toEqual({
      heading: "Hotton bridge",
      note: "Steep bank\nPark at the church",
      detail: "Put-in, Slipway",
    });
  });

  it("without a name, leads with the note's first line and doesn't repeat it below", () => {
    expect(accessPointText({ ...point, note: "\n Steep bank \nPark at the church" })).toEqual({
      heading: "Steep bank",
      note: "Park at the church",
      detail: "Put-in, Slipway",
    });
  });

  it("without a name or a note, leads with use and kind and has no detail line", () => {
    expect(accessPointText({ ...point, note: "  " })).toEqual({ heading: "Put-in, Slipway", note: "", detail: null });
  });

  it("a name of only spaces doesn't count", () => {
    expect(accessPointText({ ...point, name: "  ", note: "Steps" }).heading).toBe("Steps");
  });
});
