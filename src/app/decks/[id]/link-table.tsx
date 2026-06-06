"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import CopyButton from "./copy-button";
import HubspotRetry from "./hubspot-retry";

export type LinkRow = {
  id: string;
  token: string;
  full_url: string;
  created_at: string;
  contact: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    hubspot_id: string | null;
    hubspot_url: string | null;
  } | null;
};

type Stats = {
  opened: boolean;
  views: number;
  lastSeen: string | null;
  furthestSlide: number;
  slides: { slide: string; views: number }[];
  artifactViews: number;
  timeSeconds: number;
  artifactSeconds: number;
  perSlideSeconds: Record<string, number>;
};

type Cell = { state: "loading" | "ok" | "error"; stats?: Stats };

function fmtDuration(s: number): string {
  if (!s) return "0s";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m ${sec}s` : `${sec}s`;
}

export default function LinkTable({
  rows,
  hubspotOn,
  plausibleOn,
}: {
  rows: LinkRow[];
  hubspotOn: boolean;
  plausibleOn: boolean;
}) {
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadStats = useCallback(async () => {
    if (!plausibleOn || rows.length === 0) return;
    setLoading(true);
    setCells(Object.fromEntries(rows.map((r) => [r.token, { state: "loading" as const }])));
    await Promise.all(
      rows.map(async (r) => {
        try {
          const res = await fetch(`/api/links/${r.token}/stats`);
          if (!res.ok) throw new Error();
          const json = await res.json();
          setCells((c) => ({ ...c, [r.token]: { state: "ok", stats: json.stats } }));
        } catch {
          setCells((c) => ({ ...c, [r.token]: { state: "error" } }));
        }
      }),
    );
    setRefreshedAt(new Date().toLocaleTimeString());
    setLoading(false);
  }, [rows, plausibleOn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, [loadStats]);

  function toggle(token: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(token)) n.delete(token);
      else n.add(token);
      return n;
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-medium text-ink">
          Links <span className="font-sans text-base font-normal text-ink-muted">({rows.length})</span>
        </h2>
        {plausibleOn && rows.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            {refreshedAt && <span>updated {refreshedAt}</span>}
            <button type="button" onClick={loadStats} disabled={loading} className="btn btn-ghost btn-xs">
              {loading ? "Refreshing…" : "Refresh stats"}
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="card px-6 py-10 text-center text-sm text-ink-muted">
          No links yet. Use the form above to create one.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Contact</th>
                <th className="px-3 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium">Link</th>
                <th className="px-3 py-2.5 font-medium">Opened</th>
                <th className="px-3 py-2.5 font-medium">Views</th>
                <th className="px-3 py-2.5 font-medium">Last seen</th>
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Slide depth</th>
                <th className="px-3 py-2.5 font-medium">Artifact</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const cell = cells[r.token];
                const s = cell?.state === "ok" ? cell.stats : undefined;
                const stat = (v: React.ReactNode) =>
                  !plausibleOn ? "—" : cell?.state === "loading" ? "…" : cell?.state === "error" ? "—" : v;
                return (
                  <tr key={r.id} className="align-top transition-colors hover:bg-surface-subtle">
                    <td className="px-3 py-2.5">
                      <Link href={`/links/${r.token}`} className="font-medium text-ink hover:text-link">
                        {r.contact?.name ?? "—"} →
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <span>{r.contact?.email}</span>
                        {r.contact?.hubspot_url && (
                          <a href={r.contact.hubspot_url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                            HubSpot ↗
                          </a>
                        )}
                        {hubspotOn && r.contact && !r.contact.hubspot_id && <HubspotRetry contactId={r.contact.id} />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{r.contact?.company ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <code className="max-w-[13rem] truncate text-xs text-ink-muted">{r.full_url}</code>
                        <CopyButton value={r.full_url} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink">{stat(s?.opened ? "Yes" : "No")}</td>
                    <td className="px-3 py-2.5 text-ink">{stat(s ? s.views : null)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">{stat(s?.lastSeen ?? "—")}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink">{stat(s ? fmtDuration(s.timeSeconds) : null)}</td>
                    <td className="px-3 py-2.5">
                      {stat(
                        s ? (
                          <button
                            type="button"
                            onClick={() => toggle(r.token)}
                            className="font-medium text-link underline-offset-2 hover:underline"
                            title="Per-slide detail"
                          >
                            {s.furthestSlide || 0}
                            {expanded.has(r.token) ? " ▾" : " ▸"}
                          </button>
                        ) : null,
                      )}
                      {expanded.has(r.token) && s && (
                        <div className="mt-1.5 space-y-0.5">
                          {s.slides.length === 0 ? (
                            <span className="text-xs text-ink-muted/70">no slide views</span>
                          ) : (
                            s.slides.map((sl) => (
                              <div key={sl.slide} className="flex justify-between gap-3 text-xs text-ink-muted">
                                <span>{sl.slide}</span>
                                <span>
                                  {sl.views} view{sl.views === 1 ? "" : "s"}
                                  {s.perSlideSeconds[sl.slide] ? ` · ${fmtDuration(s.perSlideSeconds[sl.slide])}` : ""}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink">{stat(s ? (s.artifactViews > 0 ? "Yes" : "No") : null)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-ink-muted/70">
        {plausibleOn
          ? "Counts (views, depth, opened, artifact) from Plausible; “Time” is engaged time-on-deck (visible-only) from our collector. Click a contact for the full prospect view."
          : "Plausible isn’t configured — counts are hidden; “Time” still works via the engagement collector."}
      </p>
    </div>
  );
}
