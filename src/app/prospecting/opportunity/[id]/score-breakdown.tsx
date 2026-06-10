"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

export type ScoreComponent = { id: string; component: string; weight_max: number; points: number; note: string | null };
export type Feedback = { reviewer_score: number | null; component_points: Record<string, number> | null; verdict: string | null; notes: string | null } | null;

const VERDICTS = [
  { v: "", label: "— verdict —" }, { v: "agree", label: "Agree" },
  { v: "too_high", label: "Too high" }, { v: "too_low", label: "Too low" }, { v: "reject", label: "Reject" },
];

export default function ScoreBreakdown({
  opportunityId, skillScore, components, feedback,
}: {
  opportunityId: string; skillScore: number | null; components: ScoreComponent[]; feedback: Feedback;
}) {
  const router = useRouter();
  const initPts = (c: ScoreComponent) => feedback?.component_points?.[c.component] ?? c.points;
  const [pts, setPts] = useState<Record<string, number>>(() => Object.fromEntries(components.map((c) => [c.component, initPts(c)])));
  const [verdict, setVerdict] = useState(feedback?.verdict ?? "");
  const [notes, setNotes] = useState(feedback?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const skillTotal = components.reduce((s, c) => s + c.points, 0);
  const reviewerTotal = useMemo(() => components.reduce((s, c) => s + (pts[c.component] ?? c.points), 0), [components, pts]);
  const dirty = useMemo(
    () => components.some((c) => (pts[c.component] ?? c.points) !== c.points) || verdict !== (feedback?.verdict ?? "") || notes !== (feedback?.notes ?? ""),
    [components, pts, verdict, notes, feedback],
  );

  async function save() {
    setBusy(true); setSaved(false);
    const res = await fetch(`/api/prospecting/opportunities/${opportunityId}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_points: pts, reviewer_score: reviewerTotal, verdict: verdict || null, notes: notes || null }),
    });
    setBusy(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  }

  if (components.length === 0) {
    return (
      <p className="card px-6 py-6 text-sm text-ink-muted">
        Scoring breakdown not captured for this run{skillScore != null ? ` (overall fit ${skillScore})` : ""}. Re-run the prospecting skill to populate the per-parameter weights.
      </p>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink-muted">Skill score</span>
        <span className="chip bg-surface-muted text-nav text-sm">{skillScore ?? skillTotal}</span>
        <span className="text-ink-muted">→ Reviewer-adjusted</span>
        <span className={`chip text-sm ${reviewerTotal === skillTotal ? "bg-surface-muted text-nav" : "bg-primary text-white"}`}>{reviewerTotal}</span>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="py-2 pr-3 font-medium">Parameter</th>
            <th className="px-3 py-2 font-medium">Max</th>
            <th className="px-3 py-2 font-medium">Skill</th>
            <th className="px-3 py-2 font-medium">Contribution</th>
            <th className="px-3 py-2 font-medium">Your points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {components.map((c) => (
            <tr key={c.id} className="align-middle">
              <td className="py-2 pr-3 text-ink">{c.component}{c.note && <div className="text-[0.7rem] text-ink-muted">{c.note}</div>}</td>
              <td className="px-3 py-2 text-ink-muted">{c.weight_max}</td>
              <td className="px-3 py-2 text-ink-muted">{c.points}</td>
              <td className="px-3 py-2">
                <div className="h-1.5 w-24 rounded-sm bg-surface-muted"><div className="h-1.5 rounded-sm bg-primary" style={{ width: `${Math.min(100, (c.points / c.weight_max) * 100)}%` }} /></div>
              </td>
              <td className="px-3 py-2">
                <input type="number" min={0} max={c.weight_max} value={pts[c.component] ?? c.points}
                  onChange={(e) => setPts((s) => ({ ...s, [c.component]: Math.max(0, Math.min(c.weight_max, Number(e.target.value) || 0)) }))}
                  className="w-16 rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs text-ink" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="field-label">Verdict</label>
          <select className="input w-auto" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            {VERDICTS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
          </select>
        </div>
        <div className="flex-1 space-y-1 min-w-[12rem]">
          <label className="field-label">Notes (why)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. anti-PD-1 backbone is least novel — score too high" />
        </div>
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save feedback"}</button>
      </div>
    </div>
  );
}
