import { describe, it, expect } from "vitest";
import { clampSeconds, computeEngagement, pendingMilestones, MAX_SECONDS, type ExistingEngagement } from "./engagement";

const ORDER = ["overview", "stats", "cta"]; // 3-slide deck
const TOTAL = 3;
const NOW = "2026-06-09T12:00:00.000Z";

describe("clampSeconds", () => {
  it("floors, rejects negatives and junk, caps at MAX_SECONDS", () => {
    expect(clampSeconds(12.9)).toBe(12);
    expect(clampSeconds(-5)).toBe(0);
    expect(clampSeconds("nope")).toBe(0);
    expect(clampSeconds(null)).toBe(0);
    expect(clampSeconds(MAX_SECONDS + 1000)).toBe(MAX_SECONDS);
  });
});

describe("computeEngagement — first beacon", () => {
  it("records first_seen_at and crosses 'opened the deck'", () => {
    const { row, crossed } = computeEngagement(null, { surface: "deck", seconds: 4 }, ORDER, TOTAL, NOW);
    expect(row.first_seen_at).toBe(NOW);
    expect(row.deck_seconds).toBe(4);
    expect(crossed).toContain("opened the deck");
    expect(crossed).not.toContain("reached the call-to-action");
  });
});

describe("computeEngagement — max-seen semantics (no regression)", () => {
  const existing: ExistingEngagement = {
    deck_seconds: 30,
    per_slide: { overview: 20, stats: 10 },
    furthest_index: 2,
    first_seen_at: "2026-06-08T00:00:00.000Z",
    opened_notified_at: "2026-06-08T00:00:00.000Z",
  };

  it("never lets a smaller out-of-order beacon lower deck_seconds or per-slide", () => {
    const { row } = computeEngagement(
      existing,
      { surface: "deck", seconds: 5, perSlide: { overview: 3 } },
      ORDER,
      TOTAL,
      NOW,
    );
    expect(row.deck_seconds).toBe(30); // kept, not dropped to 5
    expect(row.per_slide.overview).toBe(20); // kept, not dropped to 3
  });

  it("advances per-slide and deck_seconds when the beacon is larger", () => {
    const { row } = computeEngagement(
      existing,
      { surface: "deck", seconds: 45, perSlide: { stats: 18 } },
      ORDER,
      TOTAL,
      NOW,
    );
    expect(row.deck_seconds).toBe(45);
    expect(row.per_slide.stats).toBe(18);
  });

  it("furthest_index never regresses", () => {
    const { row } = computeEngagement(existing, { surface: "deck", seconds: 1, perSlide: { overview: 1 } }, ORDER, TOTAL, NOW);
    expect(row.furthest_index).toBe(2); // overview is idx 1, existing furthest 2 wins
  });
});

describe("computeEngagement — reached CTA", () => {
  it("flips reached_cta exactly when furthest hits total, and crosses once", () => {
    const before = computeEngagement(null, { surface: "deck", seconds: 5, perSlide: { stats: 5 } }, ORDER, TOTAL, NOW);
    expect(before.row.reached_cta).toBe(false);
    expect(before.crossed).not.toContain("reached the call-to-action");

    const at = computeEngagement(null, { surface: "deck", seconds: 5, perSlide: { cta: 5 } }, ORDER, TOTAL, NOW);
    expect(at.row.furthest_index).toBe(3);
    expect(at.row.reached_cta).toBe(true);
    expect(at.crossed).toContain("reached the call-to-action");
  });

  it("stays reached once true even if a later beacon has no cta slide", () => {
    const existing: ExistingEngagement = { reached_cta: true, cta_notified_at: NOW, first_seen_at: NOW, opened_notified_at: NOW };
    const { row, crossed } = computeEngagement(existing, { surface: "deck", seconds: 1, perSlide: { overview: 1 } }, ORDER, TOTAL, NOW);
    expect(row.reached_cta).toBe(true);
    expect(crossed).not.toContain("reached the call-to-action"); // already notified
  });
});

describe("computeEngagement — once-only milestones", () => {
  it("does not re-cross milestones already notified", () => {
    const existing: ExistingEngagement = {
      first_seen_at: "2026-06-08T00:00:00.000Z",
      opened_notified_at: "2026-06-08T00:00:00.000Z",
      reached_cta: true,
      cta_notified_at: "2026-06-08T00:00:00.000Z",
      artifact_seconds: 10,
      artifact_notified_at: "2026-06-08T00:00:00.000Z",
    };
    const { crossed } = computeEngagement(existing, { surface: "deck", seconds: 99, perSlide: { cta: 99 } }, ORDER, TOTAL, NOW);
    expect(crossed).toEqual([]);
  });
});

describe("pendingMilestones (cron backstop condition)", () => {
  it("returns nothing for a fresh/empty row", () => {
    expect(pendingMilestones({})).toEqual([]);
  });

  it("flags an open whose alert never fired (recovers what per-beacon 'crossed' drops)", () => {
    expect(pendingMilestones({ first_seen_at: NOW, opened_notified_at: null })).toEqual(["opened the deck"]);
  });

  it("flags reached-CTA and artifact when unnotified", () => {
    const pending = pendingMilestones({
      first_seen_at: NOW,
      opened_notified_at: NOW,
      reached_cta: true,
      cta_notified_at: null,
      artifact_seconds: 8,
      artifact_notified_at: null,
    });
    expect(pending).toEqual(["reached the call-to-action", "opened the data/example page"]);
  });

  it("returns nothing once everything is notified", () => {
    expect(
      pendingMilestones({
        first_seen_at: NOW,
        opened_notified_at: NOW,
        reached_cta: true,
        cta_notified_at: NOW,
        artifact_seconds: 8,
        artifact_notified_at: NOW,
      }),
    ).toEqual([]);
  });

  it("does not flag artifact when there is no recorded artifact time", () => {
    expect(pendingMilestones({ first_seen_at: NOW, opened_notified_at: NOW, artifact_seconds: 0 })).toEqual([]);
  });
});

describe("computeEngagement — artifact surface", () => {
  it("marks artifactOpened and crosses even when seconds is 0 (immediate open)", () => {
    const { row, crossed, artifactOpened } = computeEngagement(null, { surface: "artifact", seconds: 0 }, ORDER, TOTAL, NOW);
    expect(artifactOpened).toBe(true);
    expect(row.artifact_seconds).toBe(0);
    expect(crossed).toContain("opened the data/example page");
  });

  it("does not touch deck_seconds or per_slide from an artifact beacon", () => {
    const existing: ExistingEngagement = { deck_seconds: 50, per_slide: { overview: 50 }, first_seen_at: NOW, opened_notified_at: NOW };
    const { row } = computeEngagement(existing, { surface: "artifact", seconds: 12, perSlide: { overview: 999 } }, ORDER, TOTAL, NOW);
    expect(row.deck_seconds).toBe(50);
    expect(row.per_slide.overview).toBe(50); // artifact beacon perSlide ignored
    expect(row.artifact_seconds).toBe(12);
  });
});
