// The app manifest (#56, ADR 0023): what makes packraft-go installable.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { strings } from "@/ui/strings";
import manifest from "./manifest";

const PUBLIC = path.resolve(__dirname, "../../public");

/** Width and height from a PNG file's header. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("app manifest", () => {
  const app = manifest();

  it("opens the planner as a standalone app", () => {
    expect(app.name).toBe(strings.appTitle);
    expect(app.short_name).toBe(strings.appTitle);
    expect(app.description).toBe(strings.appDescription);
    expect(app.start_url).toBe("/");
    expect(app.scope).toBe("/");
    expect(app.display).toBe("standalone");
  });

  it("has 192 and 512 pixel icons, including a maskable one", () => {
    const icons = app.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("points at PNG files of the sizes it declares", () => {
    for (const icon of manifest().icons ?? []) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(path.join(PUBLIC, icon.src))).toBe(icon.sizes);
    }
  });
});
