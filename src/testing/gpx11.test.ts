// The GPX 1.1 structure check used by the export tests (#11) must reject what the schema rejects.
import { describe, expect, it } from "vitest";
import { parseGpx11 } from "./gpx11";

const gpx = (body: string, root = 'version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx ${root}>${body}</gpx>`;

describe("GPX 1.1 structure check", () => {
  it("accepts a minimal valid file and reads it", () => {
    const parsed = parseGpx11(
      gpx(
        '<metadata><name>T &amp; U</name></metadata><wpt lat="50" lon="4"><ele>12.5</ele><name>Camp 1</name></wpt>' +
          '<trk><name>Leg 1</name><trkseg><trkpt lat="50" lon="4"/><trkpt lat="50.1" lon="-4.1"><ele>3</ele></trkpt></trkseg></trk>',
      ),
    );
    expect(parsed).toEqual({
      metadataName: "T & U",
      waypoints: [{ lat: 50, lon: 4, ele: 12.5, name: "Camp 1" }],
      tracks: [{ name: "Leg 1", points: [{ lat: 50, lon: 4 }, { lat: 50.1, lon: -4.1, ele: 3 }] }],
    });
  });

  it.each([
    ["XML that is not well-formed", gpx("<metadata><name>x</metadata>")],
    ["no XML declaration", gpx("").replace(/^<\?xml[^>]*>\n/, "")],
    ["the wrong namespace", gpx("", 'version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/0"')],
    ["the wrong version", gpx("", 'version="1.0" creator="t" xmlns="http://www.topografix.com/GPX/1/1"')],
    ["no creator", gpx("", 'version="1.1" xmlns="http://www.topografix.com/GPX/1/1"')],
    ["tracks before waypoints", gpx('<trk/><wpt lat="1" lon="1"/>')],
    ["metadata twice", gpx("<metadata/><metadata/>")],
    ["an unknown element", gpx("<route/>")],
    ["name before ele in a waypoint", gpx('<wpt lat="1" lon="1"><name>a</name><ele>1</ele></wpt>')],
    ["a track point without lon", gpx('<trk><trkseg><trkpt lat="1"/></trkseg></trk>')],
    ["a latitude out of range", gpx('<wpt lat="91" lon="1"/>')],
    ["longitude 180", gpx('<wpt lat="1" lon="180"/>')],
    ["an elevation that is not a number", gpx('<trk><trkseg><trkpt lat="1" lon="1"><ele>NaN</ele></trkpt></trkseg></trk>')],
    ["track name after a segment", gpx("<trk><trkseg/><name>x</name></trk>")],
    // XML 1.0 forbids these characters even escaped; xmldom lets them through, so the check must not.
    ["a control character in a name", gpx("<metadata><name>Bell\u0007 trip</name></metadata>")],
    ["a vertical tab in an attribute", gpx('<wpt lat="1\u000B" lon="1"/>')],
    ["U+FFFE in a name", gpx("<metadata><name>a￾</name></metadata>")],
    ["a lone surrogate in a name", gpx("<metadata><name>a\uD800b</name></metadata>")],
  ])("rejects %s", (_, text) => {
    expect(() => parseGpx11(text)).toThrow();
  });
});
