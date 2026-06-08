// Pure cadence helpers (no server-only — safe to import in tests + client/server).

export type CadenceStep = { seq: number; label: string; day_offset: number };

export const DEFAULT_CADENCE: CadenceStep[] = [
  { seq: 1, label: "Touch 1", day_offset: 0 },
  { seq: 2, label: "Touch 2", day_offset: 4 },
  { seq: 3, label: "Touch 3", day_offset: 9 },
];

/** Due date for a touch given the account's cadence anchor (Touch 1 sent date). */
export function touchDueDate(startedAt: string | null, dayOffset: number): string | null {
  if (!startedAt) return null;
  const d = new Date(startedAt);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
}

export type TouchRow = { seq: number; day_offset: number; status: string; sent_at: string | null };

/** Cadence summary for the dashboard: next pending touch + whether it's due/overdue. */
export function cadenceStage(
  touches: TouchRow[],
  startedAt: string | null,
  now: number,
): { label: string; dueDate: string | null; overdue: boolean; complete: boolean } {
  const sorted = [...touches].sort((a, b) => a.seq - b.seq);
  const pending = sorted.find((t) => t.status === "draft");
  if (!pending) return { label: "Complete", dueDate: null, overdue: false, complete: true };
  if (!startedAt) {
    return { label: pending.seq === 1 ? "Not started" : "Awaiting Touch 1", dueDate: null, overdue: false, complete: false };
  }
  const due = touchDueDate(startedAt, pending.day_offset);
  const overdue = due ? new Date(due).getTime() < now : false;
  return { label: `Touch ${pending.seq} ${overdue ? "overdue" : "due"}`, dueDate: due, overdue, complete: false };
}
