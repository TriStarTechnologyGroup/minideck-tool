"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

export type Capability = { id: string; capability_id: string | null; name: string; category: string | null; description: string | null };
export type Tma = {
  id: string; sku: string | null; ta_number: string | null; name: string | null; short_description: string | null;
  description: string | null; categories: string | null; primary_categories: string | null; donor_samples_each: number | null;
  approx_cores: number | null; approx_donors: number | null; core_size: string | null; markers: string | null; suitable_for: string | null;
};

const ic = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";
const fc = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink";

export default function CatalogManager({ tmas, capabilities, isAdmin }: { tmas: Tma[]; capabilities: Capability[]; isAdmin: boolean }) {
  const [tab, setTab] = useState<"tmas" | "capabilities">("tmas");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-line">
        {(["tmas", "capabilities"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {t === "tmas" ? `Tissue microarrays (${tmas.length})` : `Capabilities (${capabilities.length})`}
          </button>
        ))}
      </div>
      {tab === "tmas" ? <TmaManager tmas={tmas} isAdmin={isAdmin} /> : <CapabilitiesManager capabilities={capabilities} isAdmin={isAdmin} />}
    </div>
  );
}

// ── Capabilities ──────────────────────────────────────────────────────────────
function CapabilitiesManager({ capabilities, isAdmin }: { capabilities: Capability[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {isAdmin && !adding && <button type="button" className="btn btn-secondary self-start" onClick={() => setAdding(true)}>+ Add capability</button>}
      {adding && <CapRow cap={null} isAdmin onDone={() => setAdding(false)} />}
      {capabilities.map((c) => <CapRow key={c.id} cap={c} isAdmin={isAdmin} />)}
      {capabilities.length === 0 && !adding && <p className="card px-6 py-8 text-center text-sm text-ink-muted">No capabilities yet.</p>}
    </div>
  );
}

function CapRow({ cap, isAdmin, onDone }: { cap: Capability | null; isAdmin: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ capability_id: cap?.capability_id ?? "", name: cap?.name ?? "", category: cap?.category ?? "", description: cap?.description ?? "" });
  const [busy, setBusy] = useState(false);
  const dirty = !cap || v.capability_id !== (cap.capability_id ?? "") || v.name !== cap.name || v.category !== (cap.category ?? "") || v.description !== (cap.description ?? "");

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch("/api/catalog/capabilities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { onDone?.(); router.refresh(); } else alert((await r.json().catch(() => ({}))).error || "Failed");
  }

  if (!isAdmin) {
    return (
      <div className="card p-3 text-sm">
        <div className="flex items-center gap-2">{cap?.capability_id && <span className="font-mono text-xs text-nav">{cap.capability_id}</span>}<span className="font-medium text-ink">{cap?.name}</span>{cap?.category && <span className="chip bg-surface-muted text-nav text-[0.6rem]">{cap.category}</span>}</div>
        {cap?.description && <p className="mt-1 text-xs text-ink-muted">{cap.description}</p>}
      </div>
    );
  }
  return (
    <div className="card flex flex-wrap items-start gap-2 p-3">
      <input className={`${ic} w-24`} placeholder="ID" value={v.capability_id} onChange={(e) => setV({ ...v, capability_id: e.target.value })} />
      <input className={`${ic} w-48`} placeholder="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <input className={`${ic} w-32`} placeholder="Category" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
      <input className={`${ic} min-w-[12rem] flex-1`} placeholder="Description" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      <button type="button" className="btn btn-primary btn-xs" disabled={busy || !dirty || !v.name.trim()}
        onClick={() => post(cap ? { action: "update", id: cap.id, data: { ...v, capability_id: v.capability_id || null, category: v.category || null, description: v.description || null } } : { action: "create", data: { ...v, capability_id: v.capability_id || null, category: v.category || null, description: v.description || null } })}>
        {cap ? "Save" : "Add"}
      </button>
      {cap ? <button type="button" className="btn btn-danger btn-xs" disabled={busy} onClick={() => confirm(`Delete ${cap.name}?`) && post({ action: "delete", id: cap.id })}>Delete</button>
        : <button type="button" className="btn btn-ghost btn-xs" onClick={onDone}>Cancel</button>}
    </div>
  );
}

// ── TMA catalog ─────────────────────────────────────────────────────────────
function TmaManager({ tmas, isAdmin }: { tmas: Tma[]; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [suit, setSuit] = useState("all");
  const [editing, setEditing] = useState<Tma | "new" | null>(null);

  const cats = useMemo(() => [...new Set(tmas.map((t) => t.primary_categories || t.categories).filter(Boolean) as string[])].sort(), [tmas]);
  const suits = useMemo(() => [...new Set(tmas.map((t) => t.suitable_for).filter(Boolean) as string[])].sort(), [tmas]);
  const filtered = useMemo(() => tmas.filter((t) => {
    if (cat !== "all" && (t.primary_categories || t.categories) !== cat) return false;
    if (suit !== "all" && t.suitable_for !== suit) return false;
    if (q.trim()) { const hay = `${t.ta_number ?? ""} ${t.name ?? ""} ${t.markers ?? ""} ${t.short_description ?? ""}`.toLowerCase(); if (!hay.includes(q.trim().toLowerCase())) return false; }
    return true;
  }), [tmas, q, cat, suit]);

  return (
    <div className="flex flex-col gap-3">
      {editing && <TmaForm tma={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-64" placeholder="Search TA#, name, markers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className="input w-auto" value={suit} onChange={(e) => setSuit(e.target.value)} aria-label="Suitable for"><option value="all">All assays</option>{suits.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <span className="text-xs text-ink-muted">{filtered.length} of {tmas.length}</span>
        {isAdmin && <button type="button" className="btn btn-secondary ml-auto" onClick={() => setEditing("new")}>+ Add TMA</button>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2.5 font-medium">TA #</th><th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Markers</th><th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Suitable for</th><th className="px-3 py-2.5 text-right font-medium">Donors</th>
              {isAdmin && <th className="px-3 py-2.5 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((t) => (
              <tr key={t.id} className="align-top transition-colors hover:bg-surface-subtle">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono"><Link href={`/prospecting/tma/${t.id}`} className="text-link hover:underline">{t.ta_number ?? "—"}</Link></td>
                <td className="px-3 py-2.5 text-ink">{t.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-muted">{t.markers ?? "—"}</td>
                <td className="max-w-[14rem] truncate px-3 py-2.5 text-xs text-ink-muted" title={t.primary_categories || t.categories || ""}>{t.primary_categories || t.categories || "—"}</td>
                <td className="px-3 py-2.5 text-ink-muted">{t.suitable_for ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-ink-muted">{t.approx_donors?.toLocaleString() ?? "—"}</td>
                {isAdmin && <td className="px-3 py-2.5"><button type="button" className="text-xs text-link hover:underline" onClick={() => setEditing(t)}>Edit</button></td>}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-sm text-ink-muted">No SKUs match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TmaForm({ tma, onDone }: { tma: Tma | null; onDone: () => void }) {
  const router = useRouter();
  const blank = { sku: "", ta_number: "", name: "", short_description: "", description: "", categories: "", primary_categories: "", donor_samples_each: "", approx_cores: "", approx_donors: "", core_size: "", markers: "", suitable_for: "" };
  const [v, setV] = useState<Record<string, string>>(tma ? Object.fromEntries(Object.entries(blank).map(([k]) => [k, (tma as unknown as Record<string, unknown>)[k] == null ? "" : String((tma as unknown as Record<string, unknown>)[k])])) : blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const numOrNull = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) || 0));

  async function save() {
    setBusy(true); setError(null);
    const data = {
      sku: v.sku || null, ta_number: v.ta_number || null, name: v.name, short_description: v.short_description || null,
      description: v.description || null, categories: v.categories || null, primary_categories: v.primary_categories || null,
      donor_samples_each: numOrNull(v.donor_samples_each), approx_cores: numOrNull(v.approx_cores), approx_donors: numOrNull(v.approx_donors),
      core_size: v.core_size || null, markers: v.markers || null, suitable_for: v.suitable_for || null,
    };
    const r = await fetch("/api/catalog/tma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tma ? { action: "update", id: tma.id, data } : { action: "create", data }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Save failed"); return; }
    onDone(); router.refresh();
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between"><h3 className="font-display text-base font-medium text-ink">{tma ? `Edit ${tma.ta_number ?? tma.name}` : "Add TMA"}</h3>
        {tma && <button type="button" className="btn btn-danger btn-xs" disabled={busy} onClick={async () => { if (!confirm(`Delete ${tma.ta_number ?? tma.name}?`)) return; setBusy(true); const r = await fetch("/api/catalog/tma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: tma.id }) }); setBusy(false); if (r.ok) { onDone(); router.refresh(); } }}>Delete</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="space-y-1"><span className="field-label">TA #</span><input className={fc} value={v.ta_number} onChange={(e) => set("ta_number", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">SKU</span><input className={fc} value={v.sku} onChange={(e) => set("sku", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Name</span><input className={fc} value={v.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Markers</span><input className={fc} value={v.markers} onChange={(e) => set("markers", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Suitable for</span><input className={fc} value={v.suitable_for} onChange={(e) => set("suitable_for", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Core size</span><input className={fc} value={v.core_size} onChange={(e) => set("core_size", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Donors</span><input type="number" className={fc} value={v.approx_donors} onChange={(e) => set("approx_donors", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Cores</span><input type="number" className={fc} value={v.approx_cores} onChange={(e) => set("approx_cores", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Samples/donor</span><input type="number" className={fc} value={v.donor_samples_each} onChange={(e) => set("donor_samples_each", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Categories</span><input className={fc} value={v.categories} onChange={(e) => set("categories", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Primary categories</span><input className={fc} value={v.primary_categories} onChange={(e) => set("primary_categories", e.target.value)} /></label>
      </div>
      <label className="block space-y-1"><span className="field-label">Short description</span><textarea className={fc} rows={2} value={v.short_description} onChange={(e) => set("short_description", e.target.value)} /></label>
      <label className="block space-y-1"><span className="field-label">Description</span><textarea className={fc} rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} /></label>
      {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={busy || !v.name.trim()} onClick={save}>{busy ? "Saving…" : tma ? "Save changes" : "Add TMA"}</button><button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button></div>
    </div>
  );
}
