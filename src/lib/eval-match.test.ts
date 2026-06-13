import { describe, it, expect } from "vitest";
import { setScore, asArray, norm } from "./eval-match";

describe("asArray", () => {
  it("passes arrays through as strings", () => {
    expect(asArray(["a", "b", 3])).toEqual(["a", "b", "3"]);
  });
  it("splits delimited strings on ; , |", () => {
    expect(asArray("TMA-1; TMA-2 , TMA-3 | TMA-4")).toEqual(["TMA-1", "TMA-2", "TMA-3", "TMA-4"]);
  });
  it("returns [] for empty / non-listy values", () => {
    expect(asArray("")).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray({})).toEqual([]);
  });
});

describe("setScore — precision/recall/F1", () => {
  it("perfect match scores F1 = 1 (case/space-insensitive)", () => {
    const s = setScore(["TMA-1", "tma-2"], [" tma-1 ", "TMA-2"]);
    expect(s.f1).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.missing).toEqual([]);
    expect(s.extra).toEqual([]);
  });
  it("reports missing (gold not predicted) and extra (predicted not gold)", () => {
    const s = setScore(["a", "b", "x"], ["a", "b", "c"]);
    expect(s.tp).toBe(2);
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.f1).toBeCloseTo(2 / 3);
    expect(s.missing).toEqual([norm("c")]);
    expect(s.extra).toEqual([norm("x")]);
  });
  it("empty prediction against a non-empty gold scores 0", () => {
    const s = setScore([], ["a", "b"]);
    expect(s.f1).toBe(0);
    expect(s.recall).toBe(0);
  });
  it("empty-vs-empty is a vacuous pass (F1 = 1)", () => {
    expect(setScore([], []).f1).toBe(1);
  });
});
