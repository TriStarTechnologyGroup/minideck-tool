import { describe, it, expect } from "vitest";
import { touchDueDate, cadenceStage, DEFAULT_CADENCE } from "./cadence";

const anchor = "2026-06-08T00:00:00.000Z";
const t = (seq: number, day_offset: number, status: string) => ({ seq, day_offset, status, sent_at: null });

describe("touchDueDate", () => {
  it("adds the day offset to the anchor", () => {
    expect(touchDueDate(anchor, 0)).toBe("2026-06-08T00:00:00.000Z");
    expect(touchDueDate(anchor, 4)).toBe("2026-06-12T00:00:00.000Z");
    expect(touchDueDate(anchor, 9)).toBe("2026-06-17T00:00:00.000Z");
  });
  it("returns null when not started", () => {
    expect(touchDueDate(null, 4)).toBeNull();
  });
});

describe("cadenceStage", () => {
  const touches = DEFAULT_CADENCE.map((s) => t(s.seq, s.day_offset, "draft"));
  it("is 'Not started' before Touch 1 is sent", () => {
    const s = cadenceStage(touches, null, Date.parse("2026-06-08T12:00:00Z"));
    expect(s).toMatchObject({ label: "Not started", complete: false, overdue: false });
  });
  it("flags the next touch due after the anchor", () => {
    const sent1 = [{ ...t(1, 0, "sent"), sent_at: anchor }, t(2, 4, "draft"), t(3, 9, "draft")];
    const s = cadenceStage(sent1, anchor, Date.parse("2026-06-10T00:00:00Z")); // before +4
    expect(s).toMatchObject({ label: "Touch 2 due", overdue: false, complete: false });
    expect(s.dueDate).toBe("2026-06-12T00:00:00.000Z");
  });
  it("marks overdue when past the due date", () => {
    const sent1 = [{ ...t(1, 0, "sent"), sent_at: anchor }, t(2, 4, "draft"), t(3, 9, "draft")];
    const s = cadenceStage(sent1, anchor, Date.parse("2026-06-20T00:00:00Z")); // past +4
    expect(s.overdue).toBe(true);
    expect(s.label).toBe("Touch 2 overdue");
  });
  it("is complete when all sent", () => {
    const all = DEFAULT_CADENCE.map((s) => ({ ...t(s.seq, s.day_offset, "sent"), sent_at: anchor }));
    expect(cadenceStage(all, anchor, Date.now()).complete).toBe(true);
  });
});
