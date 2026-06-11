"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type Cohort = { id: string; ta_number: string | null; cohort: string | null; markers: string | null; donors: number | null; category: string | null; custom_stain: boolean };
export type AddedTma = { ta_number: string; sku: string | null; label: string | null };
export type CatalogItem = { id: string; sku: string | null; ta_number: string | null; name: string | null };
type Verdict = "confirmed" | "rejected" | "added";

export default function TmaPanel({
  opportunityId, cohorts, verdicts, added, catalog, tmaLinkByTa,
}: {
  opportunityId: string;
  cohorts: Cohort[];
  verdicts: Record<string, Verdict>;
  added: AddedTma[];
  catalog: CatalogItem[];
  tmaLinkByTa: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    const res = await fetch(`/api/prospecting/opportunities/${opportunityId}/tma`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  // confirm/reject toggle: clicking the active verdict clears it (back to neutral)
  const setVerdict = (c: Cohort, want: "confirm" | "reject") => {
    const ta = c.ta_number!;
    const cur = verdicts[ta];
    const isActive = (want === "confirm" && cur === "confirmed") || (want === "reject" && cur === "rejected");
    act(isActive ? { action: "clear", ta_number: ta } : { action: want, ta_number: ta, sku: null, label: c.cohort ?? ta }, `${ta}:${want}`);
  };

  const matches = q.trim()
    ? catalog.filter((t) => `${t.sku ?? ""} ${t.ta_number ?? ""} ${t.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  const addedTas = new Set(added.map((a) => a.ta_number));

  const Btn = ({ on, kind, onClick, label }: { on: boolean; kind: "confirm" | "reject"; onClick: () => void; label: string }) => (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-sm border text-xs transition-colors ${
        on ? (kind === "confirm" ? "border-primary bg-primary text-white" : "border-danger bg-danger text-white")
           : "border-line text-ink-muted hover:border-line-strong"}`}>
      {kind === "confirm" ? "✓" : "✕"}
    </button>
  );

  return (
    <div className="card overflow-hidden">
      <p className="border-b border-line px-4 py-2.5 text-xs text-ink-muted">
        Confirm the TMA matches the AI suggested, reject bad ones, or add a catalog TMA it missed. This feedback is read back by the prospecting skill to hone its matching.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">TA #</th>
              <th className="px-4 py-2.5 font-medium">Cohort</th>
              <th className="px-4 py-2.5 font-medium">Markers</th>
              <th className="px-4 py-2.5 font-medium text-right">Donors</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium text-center">Match?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cohorts.map((c) => {
              const ta = c.ta_number ?? "";
              const v = verdicts[ta];
              return (
                <tr key={c.id} className={`align-top transition-colors hover:bg-surface-subtle ${v === "rejected" ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono">
                    {ta && tmaLinkByTa[ta]
                      ? <Link href={`/prospecting/tma/${tmaLinkByTa[ta]}`} className="text-link hover:underline">{ta}</Link>
                      : <span className="text-ink">{ta || "—"}</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-ink ${v === "rejected" ? "line-through" : ""}`}>{c.cohort}</td>
                  <td className="px-4 py-2.5">{c.custom_stain ? <span className="text-xs text-ink-muted/70">custom stain</span> : <span className="text-ink-muted">{c.markers ?? "—"}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink">{c.donors?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">{c.category ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      {ta ? (
                        <>
                          <Btn on={v === "confirmed"} kind="confirm" label="Good match" onClick={() => setVerdict(c, "confirm")} />
                          <Btn on={v === "rejected"} kind="reject" label="Bad match" onClick={() => setVerdict(c, "reject")} />
                        </>
                      ) : <span className="text-xs text-ink-muted/50">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {cohorts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-ink-muted">No AI-matched cohorts on file — add the relevant catalog TMAs below.</td></tr>
            )}
            {added.filter((a) => !cohorts.some((c) => c.ta_number === a.ta_number)).map((a) => (
              <tr key={a.ta_number} className="bg-surface-blue-soft/40 align-top">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono">
                  {tmaLinkByTa[a.ta_number] ? <Link href={`/prospecting/tma/${tmaLinkByTa[a.ta_number]}`} className="text-link hover:underline">{a.ta_number}</Link> : <span className="text-ink">{a.ta_number}</span>}
                </td>
                <td className="px-4 py-2.5 text-ink">{a.label ?? a.sku ?? a.ta_number} <span className="chip bg-surface-blue-soft text-link text-[0.6rem]">added</span></td>
                <td className="px-4 py-2.5 text-ink-muted">{a.sku ?? "—"}</td>
                <td className="px-4 py-2.5 text-right text-ink-muted">—</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-center">
                  <button type="button" disabled={busy === `${a.ta_number}:clear`} onClick={() => act({ action: "clear", ta_number: a.ta_number }, `${a.ta_number}:clear`)} className="text-xs text-danger hover:underline">remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add a catalog TMA the AI missed */}
      <div className="border-t border-line p-3">
        <div className="relative max-w-md">
          <input className="input" placeholder="Add a TMA the AI missed — search SKU / TA# / name…" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg">
              {matches.map((t) => {
                const ta = t.ta_number ?? "";
                const disabled = !ta || addedTas.has(ta) || cohorts.some((c) => c.ta_number === ta);
                return (
                  <button key={t.id} type="button" disabled={disabled || busy !== null}
                    onClick={() => { act({ action: "add", ta_number: ta, sku: t.sku ?? null, label: t.name ?? t.sku ?? ta }, `${ta}:add`); setQ(""); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-subtle disabled:opacity-40">
                    {t.sku && <span className="font-mono text-xs text-primary">{t.sku}</span>}
                    {ta && <span className="font-mono text-xs text-nav">{ta}</span>}
                    <span className="truncate text-ink">{t.name}</span>
                    {disabled && <span className="ml-auto text-[0.65rem] text-ink-muted">already listed</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
