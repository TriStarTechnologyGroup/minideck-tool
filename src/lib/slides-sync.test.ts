import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SLIDE_SLUGS } from "./slides";

// The ordered slide-slug taxonomy is hand-mirrored in two places: this module
// (server-side, drives furthest-slide + reached-CTA math) and public/track.js
// (the browser tracker). If they drift, engagement depth is computed against the
// wrong order and silently wrong. This test fails the moment one copy is edited
// without the other. See minideck-tracking-spec.md §4.
const trackJs = readFileSync(fileURLToPath(new URL("../../public/track.js", import.meta.url)), "utf8");

/** Extract the `var SLIDES = { deck: [...] }` map from track.js as plain data. */
function extractSlides(src: string): Record<string, string[]> {
  const block = src.match(/var SLIDES\s*=\s*\{([\s\S]*?)\};/);
  if (!block) throw new Error("Could not find `var SLIDES = { ... };` in public/track.js");

  const out: Record<string, string[]> = {};
  // Each entry: `key: [ "a", "b", ... ]`, where key is bare (hbs) or quoted ("ai-cohorts").
  const entryRe = /(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*:\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block[1]))) {
    const key = m[1] ?? m[2];
    out[key] = [...m[3].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  }
  return out;
}

describe("slide taxonomy stays in sync (track.js ↔ slides.ts)", () => {
  const fromTrack = extractSlides(trackJs);

  it("track.js defines the same decks as slides.ts", () => {
    expect(Object.keys(fromTrack).sort()).toEqual(Object.keys(SLIDE_SLUGS).sort());
  });

  for (const deck of Object.keys(SLIDE_SLUGS)) {
    it(`deck "${deck}" has identical ordered slugs in both`, () => {
      expect(fromTrack[deck]).toEqual(SLIDE_SLUGS[deck]);
    });
  }
});
