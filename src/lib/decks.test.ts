import { describe, it, expect } from "vitest";
import { deckInput } from "./decks";

const base = { name: "HBS", base_url: "https://hbs.tristargroup.us", slug: "hbs", plausible_site_id: "hbs.tristargroup.us" };

describe("deckInput", () => {
  it("accepts a valid deck", () => expect(deckInput.safeParse(base).success).toBe(true));
  it("rejects non-https base_url", () => {
    expect(deckInput.safeParse({ ...base, base_url: "http://hbs.tristargroup.us" }).success).toBe(false);
  });
  it("rejects a slug with spaces/uppercase", () => {
    expect(deckInput.safeParse({ ...base, slug: "Has Space" }).success).toBe(false);
    expect(deckInput.safeParse({ ...base, slug: "HBS" }).success).toBe(false);
  });
  it("requires plausible_site_id", () => {
    expect(deckInput.safeParse({ ...base, plausible_site_id: "" }).success).toBe(false);
  });
});
