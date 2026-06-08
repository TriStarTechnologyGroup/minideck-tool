import { describe, it, expect } from "vitest";
import { slideCount, slideLabel, SLIDE_SLUGS } from "./slides";

describe("slides", () => {
  it("counts HBS slides", () => expect(slideCount("hbs")).toBe(14));
  it("counts AI Cohorts slides", () => expect(slideCount("ai-cohorts")).toBe(17));
  it("returns 0 for unknown deck", () => expect(slideCount("nope")).toBe(0));
  it("humanizes slugs", () => {
    expect(slideLabel("pre-post-soc")).toBe("Pre Post Soc");
    expect(slideLabel("cta")).toBe("Cta");
  });
  it("starts decks with overview and ends with cta", () => {
    for (const slug of Object.keys(SLIDE_SLUGS)) {
      expect(SLIDE_SLUGS[slug][0]).toBe("overview");
      expect(SLIDE_SLUGS[slug].at(-1)).toBe("cta");
    }
  });
});
