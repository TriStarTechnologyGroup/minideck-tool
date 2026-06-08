"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CopyButton from "@/components/copy-button";
import { cadenceStage, type TouchRow } from "@/lib/cadence";

export type AccountRow = {
  id: string;
  name: string;
  warmth: "hot" | "warm" | "light";
  started_at: string | null;
  status: string;
  token: string | null;
  full_url: string | null;
  primaryName: string | null;
  primaryEmail: string | null;
  touches: TouchRow[];
};

type Stats = { opened: boolean; views: number; lastSeen: string | null; ctaClicks: Record<string, number> };

const warmthChip: Record<string, string> = {
  hot: "bg-primary text-white",
  warm: "bg-surface-blue-soft text-link",
  light: "bg-surface-muted text-ink-muted",
};

type NextAct = { priority: number; tone: "hot" | "overdue" | "due" | "info"; label: string; reason: string };
const toneChip: Record<string, string> = {
  hot: "bg-primary text-white",
  overdue: "bg-danger-bg text-danger",
  due: "bg-surface-blue-soft text-link",
  info: "bg-surface-muted text-ink-muted",
};

// Fuse cadence stage + engagement into the single most relevant next action.
function nextAction(row: AccountRow, s: Stats | undefined, now: number): NextAct | null {
  const stage = cadenceStage(row.touches, row.started_at, now);
  const views = s?.views ?? 0;
  const engaged = !!s?.opened || views > 0;
  const cta = s?.ctaClicks ?? {};
  if (cta.cta_book_meeting) return { priority: 100, tone: "hot", label: "Reply now — clicked “Book a meeting”", reason: `Opened ${views}×` };
  if (cta.cta_inquire) return { priority: 95, tone: "hot", label: "Reply now — clicked “Inquire”", reason: `Opened ${views}×` };
  if (stage.complete) {
    return engaged ? { priority: 55, tone: "info", label: "Cadence complete & engaged — consider a direct nudge", reason: `Opened ${views}×` } : null;
  }
  const dueTxt = stage.dueDate ? `Due ${new Date(stage.dueDate).toLocaleDateString()}` : "";
  if (stage.label === "Not started") return { priority: 40, tone: "due", label: "Send Touch 1", reason: engaged ? `Already opened ${views}×` : "" };
  if (stage.overdue) return { priority: engaged ? 85 : 70, tone: "overdue", label: `${stage.label}${engaged ? " — warmer, they opened" : ""}`, reason: dueTxt };
  return { priority: engaged ? 60 : 50, tone: "due", label: `${stage.label}${engaged ? " — they opened, send a warmer note" : ""}`, reason: dueTxt };
}

export default function CampaignDashboard({ campaignId, rows }: { campaignId: string; rows: AccountRow[] }) {
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now()); // stable "now" for cadence due/overdue math

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/stats`);
        const json = await res.json();
        if (alive) setStats(json.stats ?? {});
      } catch {
        /* leave empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [campaignId]);

  if (rows.length === 0) {
    return <p className="card px-6 py-12 text-center text-sm text-ink-muted">No accounts yet. Use “Add account” above.</p>;
  }

  function cta(s?: Stats) {
    if (!s) return "—";
    if (s.ctaClicks?.cta_book_meeting) return "📅 Meeting";
    if (s.ctaClicks?.cta_inquire) return "Inquire";
    return "—";
  }

  const actionRows = rows
    .map((r) => ({ r, a: nextAction(r, r.token ? stats[r.token] : undefined, now) }))
    .filter((x): x is { r: AccountRow; a: NextAct } => x.a !== null)
    .sort((x, y) => y.a.priority - x.a.priority);

  return (
    <div className="flex flex-col gap-6">
      {actionRows.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-medium text-ink">
            Next actions <span className="font-sans text-sm font-normal text-ink-muted">({actionRows.length}){loading ? " · refining…" : ""}</span>
          </h2>
          <div className="card divide-y divide-line">
            {actionRows.map(({ r, a }) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/campaigns/${campaignId}/accounts/${r.id}`} className="font-medium text-ink hover:text-link">{r.name}</Link>
                  <span className="text-ink-muted"> — {a.label}</span>
                  {a.reason && <div className="text-xs text-ink-muted/70">{a.reason}</div>}
                </div>
                <Link href={`/campaigns/${campaignId}/accounts/${r.id}`} className="shrink-0">
                  <span className={`chip ${toneChip[a.tone]}`}>{a.tone === "hot" ? "🔥 act now" : a.tone === "overdue" ? "overdue" : a.tone === "due" ? "due" : "follow up"}</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="card overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2.5 font-medium">Account</th>
            <th className="px-3 py-2.5 font-medium">Warmth</th>
            <th className="px-3 py-2.5 font-medium">Primary</th>
            <th className="px-3 py-2.5 font-medium">Link</th>
            <th className="px-3 py-2.5 font-medium">Opened</th>
            <th className="px-3 py-2.5 font-medium">Views</th>
            <th className="px-3 py-2.5 font-medium">CTA</th>
            <th className="px-3 py-2.5 font-medium">Cadence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const s = r.token ? stats[r.token] : undefined;
            const stage = cadenceStage(r.touches, r.started_at, now);
            return (
              <tr key={r.id} className="align-top transition-colors hover:bg-surface-subtle">
                <td className="px-3 py-2.5">
                  <Link href={`/campaigns/${campaignId}/accounts/${r.id}`} className="font-medium text-ink hover:text-link">{r.name} →</Link>
                </td>
                <td className="px-3 py-2.5"><span className={`chip ${warmthChip[r.warmth]}`}>{r.warmth}</span></td>
                <td className="px-3 py-2.5 text-ink-muted">
                  {r.primaryName ?? "—"}
                  {r.primaryEmail && <div className="text-xs text-ink-muted/70">{r.primaryEmail}</div>}
                </td>
                <td className="px-3 py-2.5">
                  {r.full_url ? (
                    <div className="flex items-center gap-2">
                      <code className="max-w-[10rem] truncate text-xs text-ink-muted">{r.full_url}</code>
                      <CopyButton value={r.full_url} />
                    </div>
                  ) : "—"}
                </td>
                <td className="px-3 py-2.5 text-ink">{loading ? "…" : s ? (s.opened ? "Yes" : "No") : "—"}</td>
                <td className="px-3 py-2.5 text-ink">{loading ? "…" : s?.views ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink">{loading ? "…" : cta(s)}</td>
                <td className="px-3 py-2.5">
                  <span className={stage.overdue ? "font-medium text-danger" : "text-ink"}>{stage.label}</span>
                  {stage.dueDate && <div className="text-xs text-ink-muted/70">{new Date(stage.dueDate).toLocaleDateString()}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
