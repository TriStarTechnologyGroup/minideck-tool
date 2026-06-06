"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import CopyButton from "@/components/copy-button";
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

function Skel({ w = "w-8" }: { w?: string }) {
  return <span className={`inline-block h-3 ${w} animate-pulse rounded bg-surface-muted align-middle`} />;
}

export default function LinkTable({
  rows,
  hubspotOn,
  plausibleOn,
  slideTotal,
}: {
  rows: LinkRow[];
  hubspotOn: boolean;
  plausibleOn: boolean;
  slideTotal: number;
}) {
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Render a stat value: em-dash when Plausible off/errored, skeleton while loading.
  function val(cell: Cell | undefined, render: (s: Stats) => React.ReactNode, skelW?: string): React.ReactNode {
    if (!plausibleOn) return "—";
    if (!cell || cell.state === "loading") return <Skel w={skelW} />;
    if (cell.state === "error" || !cell.stats) return "—";
    return render(cell.stats);
  }
  const depth = (s: Stats) => (slideTotal ? `${s.furthestSlide} / ${slideTotal}` : String(s.furthestSlide));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-medium text-ink">
          Links <span className="font-sans text-base font-normal text-ink-muted">({rows.length})</span>
        </h2>
        {plausibleOn && rows.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            {refreshedAt && <span className="hidden sm:inline">updated {refreshedAt}</span>}
            <button type="button" onClick={loadStats} disabled={loading} className="btn btn-ghost btn-xs">
              {loading ? "Refreshing…" : "Refresh stats"}
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-ink-muted">
          No links yet. Use the form above to create one.
        </p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Link</th>
                  <th className="px-3 py-2.5 font-medium">Opened</th>
                  <th className="px-3 py-2.5 font-medium">Views</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">Last seen</th>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">Slide depth</th>
                  <th className="px-3 py-2.5 font-medium">Artifact</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const cell = cells[r.token];
                  return (
                    <tr key={r.id} className="align-top transition-colors hover:bg-surface-subtle">
                      <td className="px-3 py-2.5">
                        <Link href={`/links/${r.token}`} className="font-medium text-ink hover:text-link">
                          {r.contact?.name ?? "—"} →
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <span className="truncate">{r.contact?.email}</span>
                          {r.contact?.hubspot_url && (
                            <a href={r.contact.hubspot_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-link hover:underline">
                              HubSpot ↗
                            </a>
                          )}
                          {hubspotOn && r.contact && !r.contact.hubspot_id && <HubspotRetry contactId={r.contact.id} />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{r.contact?.company ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <code className="max-w-[12rem] truncate text-xs text-ink-muted">{r.full_url}</code>
                          <CopyButton value={r.full_url} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink">{val(cell, (s) => (s.opened ? "Yes" : "No"))}</td>
                      <td className="px-3 py-2.5 text-ink">{val(cell, (s) => s.views)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">{val(cell, (s) => s.lastSeen ?? "—", "w-16")}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink">{val(cell, (s) => fmtDuration(s.timeSeconds))}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink">{val(cell, depth)}</td>
                      <td className="px-3 py-2.5 text-ink">{val(cell, (s) => (s.artifactViews > 0 ? "Yes" : "No"))}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet: cards */}
          <div className="space-y-3 lg:hidden">
            {rows.map((r) => {
              const cell = cells[r.token];
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/links/${r.token}`} className="font-medium text-ink hover:text-link">
                        {r.contact?.name ?? "—"} →
                      </Link>
                      <p className="truncate text-xs text-ink-muted">{r.contact?.email}</p>
                      {r.contact?.company && <p className="truncate text-xs text-ink-muted">{r.contact.company}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      {r.contact?.hubspot_url && (
                        <a href={r.contact.hubspot_url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                          HubSpot ↗
                        </a>
                      )}
                      {hubspotOn && r.contact && !r.contact.hubspot_id && <HubspotRetry contactId={r.contact.id} />}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-sm bg-surface-subtle px-2 py-1 text-xs text-ink-muted">{r.full_url}</code>
                    <CopyButton value={r.full_url} />
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
                    <Stat label="Opened" v={val(cell, (s) => (s.opened ? "Yes" : "No"))} />
                    <Stat label="Views" v={val(cell, (s) => s.views)} />
                    <Stat label="Time" v={val(cell, (s) => fmtDuration(s.timeSeconds))} />
                    <Stat label="Depth" v={val(cell, depth)} />
                    <Stat label="Artifact" v={val(cell, (s) => (s.artifactViews > 0 ? "Yes" : "No"))} />
                    <Stat label="Last seen" v={val(cell, (s) => s.lastSeen ?? "—", "w-16")} />
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-2 text-xs text-ink-muted/70">
        {plausibleOn
          ? "Counts (views, depth, opened, artifact) from Plausible; “Time” is engaged time-on-deck (visible-only) from our collector. Tap a contact for the per-slide breakdown and follow-up insights."
          : "Plausible isn’t configured — counts are hidden; “Time” still works via the engagement collector."}
      </p>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-wide text-ink-muted/70">{label}</dt>
      <dd className="mt-0.5 text-ink">{v}</dd>
    </div>
  );
}
