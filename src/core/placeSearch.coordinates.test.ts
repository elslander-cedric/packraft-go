// Seam: parseCoordinates (#173, ADR 0030). Coordinates typed in the search bar
// are worked out on the device and never sent anywhere: decimal degrees,
// latitude first, optional N/S/E/W after each number.
import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./placeSearch";

describe("parseCoordinates", () => {
  it.each([
    ["50.27, 5.44", 50.27, 5.44],
    ["50.27,5.44", 50.27, 5.44],
    ["50.27 5.44", 50.27, 5.44],
    ["50.27;5.44", 50.27, 5.44],
    ["  50.27 ;  5.44  ", 50.27, 5.44],
    ["-33.9, 18.4", -33.9, 18.4],
    ["+50.27, -5.44", 50.27, -5.44],
    ["50, 5", 50, 5],
    ["50 5", 50, 5],
    ["50.27N 5.44E", 50.27, 5.44],
    ["50.27 N, 5.44 E", 50.27, 5.44],
    ["50.27n 5.44e", 50.27, 5.44],
    ["33.9S 18.4W", -33.9, -18.4],
    ["5.44E 50.27N", 50.27, 5.44],
    ["5.44E, 50.27", 50.27, 5.44],
    ["90, 180", 90, 180],
    ["-90, -180", -90, -180],
  ])("%s is coordinates", (text, lat, lng) => {
    expect(parseCoordinates(text)).toEqual({ kind: "coordinates", at: { lat, lng } });
  });

  it.each([
    ["latitude out of range", "95, 5"],
    ["latitude below range", "-90.5, 5"],
    ["longitude out of range", "50, 181"],
    ["a sign and a letter", "-50.27N 5.44E"],
    ["two latitude letters", "50.27N 5.44N"],
    ["two longitude letters", "50.27E 5.44W"],
    ["decimal commas", "50,27 5,44"],
    ["decimal commas and a semicolon", "50,27; 5,44"],
  ])("%s is bad coordinates (%s)", (_, text) => {
    expect(parseCoordinates(text)).toEqual({ kind: "bad-coordinates" });
  });

  it.each([
    ["a place name", "Hotton"],
    ["an address", "Rue du Batty 12, Hotton"],
    ["a road number", "E411"],
    ["two road numbers", "N4 E411"],
    ["one number", "50.27"],
    ["three numbers", "50.27 5.44 3"],
    ["degrees, minutes, seconds", "50°16'12\"N 5°26'24\"E"],
    ["empty text", "   "],
  ])("%s is not coordinates (%s)", (_, text) => {
    expect(parseCoordinates(text)).toEqual({ kind: "not-coordinates" });
  });
});
