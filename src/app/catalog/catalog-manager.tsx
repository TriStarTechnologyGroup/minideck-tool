"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

export type Capability = {
  id: string; capability_id: string | null; name: string; category: string | null; description: string | null;
  specs: string | null; matching_signal: string | null; solid_liquid: string | null; data_sheet: string | null;
  active: boolean | null; position: number | null; hubspot_product_id: string | null;
};
export type Tma = {
  id: string; sku: string | null; ta_number: string | null; name: string | null; short_description: string | null; hubspot_product_id: string | null;
  description: string | null; categories: string | null; primary_categories: string | null; product_cat: string | null; cancer: string | null;
  donor_samples_each: number | null; approx_cores: number | null; approx_donors: number | null;
  number_of_cores: string | null; number_of_donors: string | null; core_size: string | null; markers: string | null;
  suitable_for: string | null; suitable_for_codex: string | null; follow_up_data: string | null; molecular_data: string | null;
  images: string | null; data_sheet: string | null; gcp_dzi_file: string | null;
};

const uniqVals = (list: Tma[], sel: (t: Tma) => string | null) => [...new Set(list.map(sel).filter(Boolean) as string[])].sort();
const ic = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";
const fc = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink";

export default function CatalogManager({ tmas, capabilities, isAdmin, only }: { tmas: Tma[]; capabilities: Capability[]; isAdmin: boolean; only?: "tmas" | "capabilities" }) {
  const [tab, setTab] = useState<"tmas" | "capabilities">(only ?? "tmas");
  const active = only ?? tab;
  const synced = tmas.filter((t) => t.hubspot_product_id).length + capabilities.filter((c) => c.hubspot_product_id).length;
  const total = tmas.length + capabilities.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-1">
          {!only && (["tmas", "capabilities"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-primary text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
              {t === "tmas" ? `Tissue microarrays (${tmas.length})` : `Capabilities (${capabilities.length})`}
            </button>
          ))}
        </div>
        {isAdmin && <SyncHubspot synced={synced} total={total} />}
      </div>
      {active === "tmas" ? <TmaManager tmas={tmas} isAdmin={isAdmin} /> : <CapabilitiesManager capabilities={capabilities} isAdmin={isAdmin} />}
    </div>
  );
}

// Mirror the whole catalog into the HubSpot product library (admin). Shows how many items
// are currently linked to a HubSpot product (hubspot_product_id present).
function SyncHubspot({ synced, total }: { synced: number; total: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/catalog/sync-hubspot", { method: "POST" });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setMsg(`Synced ${json.synced}/${json.tmas + json.capabilities} · ${json.adopted} matched, ${json.created} new${json.errors?.length ? ` · ${json.errors.length} error(s)` : ""}`); router.refresh(); }
    else setMsg(json?.error ?? "Sync failed");
  }
  return (
    <div className="mb-1 flex items-center gap-3 text-xs">
      <span className="text-ink-muted">{synced}/{total} in HubSpot</span>
      <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={run}>{busy ? "Syncing…" : "Sync to HubSpot"}</button>
      {msg && <span className="text-ink-muted">{msg}</span>}
    </div>
  );
}

// ── Capabilities ──────────────────────────────────────────────────────────────
const CAT_ORDER = ["Biospecimen", "Format", "Data", "Imaging", "Data model", "Lab service", "Cohort service"];
const catRank = (c: string | null) => { const i = CAT_ORDER.indexOf(c ?? ""); return i === -1 ? 99 : i; };

function CapabilitiesManager({ capabilities, isAdmin }: { capabilities: Capability[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const cats = useMemo(() => [...new Set(capabilities.map((c) => c.category).filter(Boolean) as string[])].sort((a, b) => catRank(a) - catRank(b)), [capabilities]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return capabilities.filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      if (!n) return true;
      return [c.capability_id, c.name, c.specs, c.matching_signal, c.description].some((v) => (v ?? "").toLowerCase().includes(n));
    });
  }, [capabilities, q, cat]);

  const groups = useMemo(() => {
    const m = new Map<string, Capability[]>();
    for (const c of filtered) { const k = c.category ?? "Uncategorized"; (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
    return [...m.entries()].sort((a, b) => catRank(a[0]) - catRank(b[0])).map(([k, list]) => [k, list.sort((x, y) => (x.position ?? 0) - (y.position ?? 0))] as const);
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={fc} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={`${fc} min-w-[14rem] flex-1`} placeholder="Search id, name, specs, matching signal…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search capabilities" />
        <span className="text-xs text-ink-muted">{filtered.length} of {capabilities.length}</span>
        {isAdmin && !adding && <button type="button" className="btn btn-secondary btn-xs" onClick={() => setAdding(true)}>+ Add</button>}
      </div>
      {adding && <CapForm cap={null} onDone={() => setAdding(false)} />}
      {groups.map(([category, list]) => (
        <div key={category} className="flex flex-col gap-1.5">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-muted">{category} <span className="text-ink-muted/60">({list.length})</span></h3>
          {list.map((c) => <CapCard key={c.id} cap={c} isAdmin={isAdmin} />)}
        </div>
      ))}
      {filtered.length === 0 && !adding && <p className="card px-6 py-8 text-center text-sm text-ink-muted">No capabilities match.</p>}
    </div>
  );
}

function CapCard({ cap, isAdmin }: { cap: Capability; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <CapForm cap={cap} onDone={() => setEditing(false)} />;
  return (
    <div className="card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {cap.capability_id && <span className="font-mono text-xs text-nav">{cap.capability_id}</span>}
        <Link href={`/catalog/capabilities/${cap.id}`} className="font-medium text-ink hover:text-link">{cap.name}</Link>
        {cap.solid_liquid && <span className="chip bg-surface-muted text-nav text-[0.6rem]">{cap.solid_liquid}</span>}
        {cap.hubspot_product_id && <span className="text-[0.6rem] text-emerald-600" title="Linked to a HubSpot product">● HubSpot</span>}
        {cap.active === false && <span className="chip bg-surface-muted text-ink-muted/70 text-[0.6rem]">inactive</span>}
        {isAdmin && <button type="button" className="ml-auto text-xs text-link hover:underline" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {cap.specs && <p className="mt-1 text-xs text-ink">{cap.specs}</p>}
      {cap.matching_signal && <p className="mt-0.5 text-xs text-ink-muted">Suggest when: {cap.matching_signal}</p>}
    </div>
  );
}

function CapForm({ cap, onDone }: { cap: Capability | null; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    capability_id: cap?.capability_id ?? "", name: cap?.name ?? "", category: cap?.category ?? "", specs: cap?.specs ?? "",
    matching_signal: cap?.matching_signal ?? "", solid_liquid: cap?.solid_liquid ?? "", description: cap?.description ?? "",
    data_sheet: cap?.data_sheet ?? "", position: cap?.position != null ? String(cap.position) : "",
  });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch("/api/catalog/capabilities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { onDone(); router.refresh(); } else alert((await r.json().catch(() => ({}))).error || "Failed");
  }
  const data = () => ({
    capability_id: v.capability_id || null, name: v.name, category: v.category || null, specs: v.specs || null,
    matching_signal: v.matching_signal || null, solid_liquid: v.solid_liquid || null, description: v.description || null,
    data_sheet: v.data_sheet || null, position: v.position ? Number(v.position) : undefined,
  });

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-ink-muted">ID<input className={ic} value={v.capability_id} onChange={(e) => upd("capability_id", e.target.value)} /></label>
        <label className="col-span-2 text-xs text-ink-muted">Name<input className={ic} value={v.name} onChange={(e) => upd("name", e.target.value)} /></label>
        <label className="text-xs text-ink-muted">Category<input className={ic} value={v.category} onChange={(e) => upd("category", e.target.value)} placeholder="Lab service…" /></label>
        <label className="text-xs text-ink-muted">Solid / Liquid<input className={ic} value={v.solid_liquid} onChange={(e) => upd("solid_liquid", e.target.value)} /></label>
        <label className="text-xs text-ink-muted">Position<input className={ic} type="number" value={v.position} onChange={(e) => upd("position", e.target.value)} /></label>
        <label className="col-span-2 text-xs text-ink-muted">Data sheet (URL)<input className={ic} value={v.data_sheet} onChange={(e) => upd("data_sheet", e.target.value)} /></label>
      </div>
      <label className="text-xs text-ink-muted">Specs<input className={ic} value={v.specs} onChange={(e) => upd("specs", e.target.value)} /></label>
      <label className="text-xs text-ink-muted">Matching signal (suggest when…)<input className={ic} value={v.matching_signal} onChange={(e) => upd("matching_signal", e.target.value)} /></label>
      <label className="text-xs text-ink-muted">Description<textarea className={ic} rows={2} value={v.description} onChange={(e) => upd("description", e.target.value)} /></label>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-xs" disabled={busy || !v.name.trim()}
          onClick={() => post(cap ? { action: "update", id: cap.id, data: data() } : { action: "create", data: data() })}>{cap ? "Save" : "Add"}</button>
        {cap && <button type="button" className="btn btn-danger btn-xs" disabled={busy} onClick={() => confirm(`Delete ${cap.name}?`) && post({ action: "delete", id: cap.id })}>Delete</button>}
        <button type="button" className="btn btn-ghost btn-xs" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ── TMA catalog ─────────────────────────────────────────────────────────────
function TmaManager({ tmas, isAdmin }: { tmas: Tma[]; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [cancer, setCancer] = useState("all");
  const [cat, setCat] = useState("all");
  const [suit, setSuit] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [molecular, setMolecular] = useState("all");
  const [codex, setCodex] = useState("all");
  const [editing, setEditing] = useState<Tma | "new" | null>(null);

  const cancers = useMemo(() => uniqVals(tmas, (t) => t.cancer), [tmas]);
  const cats = useMemo(() => uniqVals(tmas, (t) => t.product_cat || t.primary_categories), [tmas]);
  const suits = useMemo(() => uniqVals(tmas, (t) => t.suitable_for), [tmas]);

  const filtered = useMemo(() => tmas.filter((t) => {
    if (cancer !== "all" && t.cancer !== cancer) return false;
    if (cat !== "all" && (t.product_cat || t.primary_categories) !== cat) return false;
    if (suit !== "all" && t.suitable_for !== suit) return false;
    if (followUp !== "all" && (t.follow_up_data ?? "") !== followUp) return false;
    if (molecular !== "all" && (t.molecular_data ?? "") !== molecular) return false;
    if (codex !== "all" && (t.suitable_for_codex ?? "") !== codex) return false;
    if (q.trim()) { const hay = `${t.sku ?? ""} ${t.ta_number ?? ""} ${t.name ?? ""} ${t.markers ?? ""} ${t.short_description ?? ""}`.toLowerCase(); if (!hay.includes(q.trim().toLowerCase())) return false; }
    return true;
  }), [tmas, q, cancer, cat, suit, followUp, molecular, codex]);

  const sel = "input w-auto";
  return (
    <div className="flex flex-col gap-3">
      {editing && <TmaForm tma={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-56" placeholder="Search SKU, TA#, name, markers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} value={cancer} onChange={(e) => setCancer(e.target.value)} aria-label="Cancer"><option value="all">All cancers</option>{cancers.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className={sel} value={suit} onChange={(e) => setSuit(e.target.value)} aria-label="Suitable for"><option value="all">All assays</option>{suits.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className={sel} value={followUp} onChange={(e) => setFollowUp(e.target.value)} aria-label="Follow-up data"><option value="all">Follow-up: any</option><option value="Yes">Follow-up: Yes</option><option value="No">Follow-up: No</option></select>
        <select className={sel} value={molecular} onChange={(e) => setMolecular(e.target.value)} aria-label="Molecular data"><option value="all">Molecular: any</option><option value="Yes">Molecular: Yes</option><option value="No">Molecular: No</option></select>
        <select className={sel} value={codex} onChange={(e) => setCodex(e.target.value)} aria-label="CODEX/GeoMx/CosMx"><option value="all">Spatial: any</option><option value="Yes">Spatial: Yes</option><option value="No">Spatial: No</option></select>
        <span className="text-xs text-ink-muted">{filtered.length} of {tmas.length}</span>
        {isAdmin && <button type="button" className="btn btn-secondary ml-auto" onClick={() => setEditing("new")}>+ Add TMA</button>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2.5 font-medium">SKU</th><th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Cancer</th><th className="px-3 py-2.5 font-medium">Markers</th>
              <th className="px-3 py-2.5 font-medium">Suitable for</th><th className="px-3 py-2.5 text-right font-medium">Donors</th>
              {isAdmin && <th className="px-3 py-2.5 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((t) => (
              <tr key={t.id} className="align-top transition-colors hover:bg-surface-subtle">
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Link href={`/prospecting/tma/${t.id}`} className="font-mono text-link hover:underline">{t.sku ?? "—"}</Link>
                  {t.ta_number && <div className="font-mono text-[0.7rem] text-ink-muted">{t.ta_number}</div>}
                </td>
                <td className="px-3 py-2.5 text-ink">{t.name ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-muted">{t.cancer ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-muted">{t.markers ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-muted">{t.suitable_for ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-ink-muted">{t.approx_donors?.toLocaleString() ?? t.number_of_donors ?? "—"}</td>
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
  const blank = { sku: "", ta_number: "", name: "", short_description: "", description: "", categories: "", primary_categories: "", product_cat: "", cancer: "", donor_samples_each: "", approx_cores: "", approx_donors: "", number_of_cores: "", number_of_donors: "", core_size: "", markers: "", suitable_for: "", suitable_for_codex: "", follow_up_data: "", molecular_data: "", images: "", data_sheet: "", gcp_dzi_file: "" };
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
      product_cat: v.product_cat || null, cancer: v.cancer || null,
      donor_samples_each: numOrNull(v.donor_samples_each), approx_cores: numOrNull(v.approx_cores), approx_donors: numOrNull(v.approx_donors),
      number_of_cores: v.number_of_cores || null, number_of_donors: v.number_of_donors || null,
      core_size: v.core_size || null, markers: v.markers || null, suitable_for: v.suitable_for || null, suitable_for_codex: v.suitable_for_codex || null,
      follow_up_data: v.follow_up_data || null, molecular_data: v.molecular_data || null,
      images: v.images || null, data_sheet: v.data_sheet || null, gcp_dzi_file: v.gcp_dzi_file || null,
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
        <label className="space-y-1"><span className="field-label">Cancer / tissue</span><input className={fc} value={v.cancer} onChange={(e) => set("cancer", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Product category</span><input className={fc} value={v.product_cat} onChange={(e) => set("product_cat", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Markers</span><input className={fc} value={v.markers} onChange={(e) => set("markers", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Suitable for IHC / RNA-ISH</span><input className={fc} value={v.suitable_for} onChange={(e) => set("suitable_for", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">CODEX / GeoMx / CosMx</span><input className={fc} value={v.suitable_for_codex} onChange={(e) => set("suitable_for_codex", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Follow-up data</span><input className={fc} value={v.follow_up_data} onChange={(e) => set("follow_up_data", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Molecular data</span><input className={fc} value={v.molecular_data} onChange={(e) => set("molecular_data", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Core size</span><input className={fc} value={v.core_size} onChange={(e) => set("core_size", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Donors (#)</span><input type="number" className={fc} value={v.approx_donors} onChange={(e) => set("approx_donors", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Cores (#)</span><input type="number" className={fc} value={v.approx_cores} onChange={(e) => set("approx_cores", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Samples / donor</span><input type="number" className={fc} value={v.donor_samples_each} onChange={(e) => set("donor_samples_each", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Donors (bucket)</span><input className={fc} value={v.number_of_donors} onChange={(e) => set("number_of_donors", e.target.value)} /></label>
        <label className="space-y-1"><span className="field-label">Cores (bucket)</span><input className={fc} value={v.number_of_cores} onChange={(e) => set("number_of_cores", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Categories</span><input className={fc} value={v.categories} onChange={(e) => set("categories", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Image URL(s)</span><input className={fc} value={v.images} onChange={(e) => set("images", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Data sheet URL</span><input className={fc} value={v.data_sheet} onChange={(e) => set("data_sheet", e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className="field-label">Scanned slide (DZI) path</span><input className={fc} value={v.gcp_dzi_file} onChange={(e) => set("gcp_dzi_file", e.target.value)} /></label>
      </div>
      <label className="block space-y-1"><span className="field-label">Short description</span><textarea className={fc} rows={2} value={v.short_description} onChange={(e) => set("short_description", e.target.value)} /></label>
      <label className="block space-y-1"><span className="field-label">Description</span><textarea className={fc} rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} /></label>
      {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={busy || !v.name.trim()} onClick={save}>{busy ? "Saving…" : tma ? "Save changes" : "Add TMA"}</button><button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button></div>
    </div>
  );
}
