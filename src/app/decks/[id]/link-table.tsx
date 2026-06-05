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
    // Fetch stats once the rows are known (and on refresh callback identity change).
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
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Links <span className="font-normal text-neutral-500">({rows.length})</span>
        </h2>
        {plausibleOn && rows.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {refreshedAt && <span>updated {refreshedAt}</span>}
            <button
              type="button"
              onClick={loadStats}
              disabled={loading}
              className="rounded-md border border-neutral-300 px-2 py-1 font-medium transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {loading ? "Refreshing…" : "Refresh stats"}
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-6 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No links yet. Use the form above to create one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Link</th>
                <th className="px-3 py-2 font-medium">Opened</th>
                <th className="px-3 py-2 font-medium">Views</th>
                <th className="px-3 py-2 font-medium">Last seen</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Slide depth</th>
                <th className="px-3 py-2 font-medium">Artifact</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((r) => {
                const cell = cells[r.token];
                const s = cell?.state === "ok" ? cell.stats : undefined;
                const stat = (v: React.ReactNode) =>
                  !plausibleOn ? "—" : cell?.state === "loading" ? "…" : cell?.state === "error" ? "—" : v;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2">
                      <Link href={`/links/${r.token}`} className="font-medium hover:underline">
                        {r.contact?.name ?? "—"} →
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>{r.contact?.email}</span>
                        {r.contact?.hubspot_url && (
                          <a href={r.contact.hubspot_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            HubSpot ↗
                          </a>
                        )}
                        {hubspotOn && r.contact && !r.contact.hubspot_id && (
                          <HubspotRetry contactId={r.contact.id} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">{r.contact?.company ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <code className="max-w-[14rem] truncate text-xs text-neutral-600 dark:text-neutral-300">
                          {r.full_url}
                        </code>
                        <CopyButton value={r.full_url} />
                      </div>
                    </td>
                    <td className="px-3 py-2">{stat(s?.opened ? "Yes" : "No")}</td>
                    <td className="px-3 py-2">{stat(s ? s.views : null)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{stat(s?.lastSeen ?? "—")}</td>
                    <td className="whitespace-nowrap px-3 py-2">{stat(s ? fmtDuration(s.timeSeconds) : null)}</td>
                    <td className="px-3 py-2">
                      {stat(
                        s ? (
                          <button
                            type="button"
                            onClick={() => toggle(r.token)}
                            className="underline underline-offset-2 hover:no-underline"
                            title="Per-slide views"
                          >
                            {s.furthestSlide || 0}
                            {expanded.has(r.token) ? " ▾" : " ▸"}
                          </button>
                        ) : null,
                      )}
                      {expanded.has(r.token) && s && (
                        <div className="mt-1 space-y-0.5">
                          {s.slides.length === 0 ? (
                            <span className="text-xs text-neutral-400">no slide views</span>
                          ) : (
                            s.slides.map((sl) => (
                              <div key={sl.slide} className="flex justify-between gap-3 text-xs text-neutral-500">
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
                    <td className="px-3 py-2">{stat(s ? (s.artifactViews > 0 ? "Yes" : "No") : null)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-neutral-400">
        {plausibleOn
          ? "“Views/Slide depth/Artifact” are page-load counts from Plausible (cached ~60s). “Time” is engaged time-on-deck from our own collector (counts only while the tab is visible, so a left-open background tab doesn’t inflate it). Expand “Slide depth” for per-slide views + seconds."
          : "Plausible isn’t configured — counts are hidden; “Time” still works via the engagement collector."}
      </p>
    </div>
  );
}
