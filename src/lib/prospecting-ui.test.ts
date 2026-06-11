import { describe, it, expect } from "vitest";
import { tmaAdjustedPoints, tierRank } from "./prospecting-ui";

describe("tmaAdjustedPoints", () => {
  const c = { base: 25, weightMax: 25, suggested: 4 }; // "Matching TMA SKU" w/ 4 suggested cohorts

  it("no reject/add signal leaves the skill score unchanged", () => {
    expect(tmaAdjustedPoints({ ...c, rejected: 0, added: 0 })).toBe(25);
  });
  it("rejecting one suggestion subtracts one match's worth", () => {
    expect(tmaAdjustedPoints({ ...c, rejected: 1, added: 0 })).toBe(19); // 25 - 25/4 = 18.75 → 19
  });
  it("rejecting all suggestions floors at 0", () => {
    expect(tmaAdjustedPoints({ ...c, rejected: 4, added: 0 })).toBe(0);
  });
  it("adding is capped at the component max", () => {
    expect(tmaAdjustedPoints({ ...c, rejected: 0, added: 3 })).toBe(25); // already at cap
  });
  it("reject then add nets out", () => {
    expect(tmaAdjustedPoints({ base: 12, weightMax: 25, suggested: 4, rejected: 2, added: 1 })).toBe(9); // 12 + (1-2)*3 = 9
  });
  it("adding when the skill found no matches uses cap/4 per match", () => {
    expect(tmaAdjustedPoints({ base: 0, weightMax: 25, suggested: 0, rejected: 0, added: 2 })).toBe(13); // 0 + 2*6.25 = 12.5 → 13
  });
  it("never exceeds the cap or goes negative", () => {
    expect(tmaAdjustedPoints({ base: 25, weightMax: 25, suggested: 2, rejected: 0, added: 5 })).toBe(25);
    expect(tmaAdjustedPoints({ base: 5, weightMax: 25, suggested: 2, rejected: 9, added: 0 })).toBe(0);
  });
});

describe("tierRank (sanity)", () => {
  it("maps tier labels", () => {
    expect(tierRank("Tier 1 — strong fit")).toBe(1);
    expect(tierRank(null)).toBe(9);
  });
});
