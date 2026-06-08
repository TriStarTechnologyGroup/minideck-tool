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

  return (
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
  );
}
