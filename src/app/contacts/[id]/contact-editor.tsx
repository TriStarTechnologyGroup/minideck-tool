"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EditableContact = {
  id: string; position: string | null; function: string | null; seniority: string | null;
  is_decision_maker: boolean | null; do_not_contact: boolean | null; linkedin_url: string | null; notes: string | null;
};

const ic = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";

export default function ContactEditor({ contact, functions }: { contact: EditableContact; functions: string[] }) {
  const router = useRouter();
  const [v, setV] = useState({
    position: contact.position ?? "", function: contact.function ?? "", seniority: contact.seniority ?? "",
    is_decision_maker: !!contact.is_decision_maker, do_not_contact: !!contact.do_not_contact,
    linkedin_url: contact.linkedin_url ?? "", notes: contact.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const upd = (k: keyof typeof v, val: string | boolean) => { setV((s) => ({ ...s, [k]: val })); setSaved(false); };

  async function save() {
    setBusy(true); setSaved(false);
    const body = { position: v.position || null, function: v.function || null, seniority: v.seniority || null,
      is_decision_maker: v.is_decision_maker, do_not_contact: v.do_not_contact, linkedin_url: v.linkedin_url || null, notes: v.notes || null };
    const r = await fetch(`/api/contacts/${contact.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { setSaved(true); router.refresh(); } else alert((await r.json().catch(() => ({}))).error || "Failed");
  }

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs text-ink-muted">Title<input className={ic} value={v.position} onChange={(e) => upd("position", e.target.value)} /></label>
        <label className="text-xs text-ink-muted">Function
          <input className={ic} list="fn-list" value={v.function} onChange={(e) => upd("function", e.target.value)} />
          <datalist id="fn-list">{functions.map((f) => <option key={f} value={f} />)}</datalist>
        </label>
        <label className="text-xs text-ink-muted">Seniority<input className={ic} value={v.seniority} onChange={(e) => upd("seniority", e.target.value)} /></label>
      </div>
      <label className="text-xs text-ink-muted">LinkedIn URL<input className={ic} value={v.linkedin_url} onChange={(e) => upd("linkedin_url", e.target.value)} /></label>
      <label className="text-xs text-ink-muted">Notes<textarea className={ic} rows={2} value={v.notes} onChange={(e) => upd("notes", e.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm text-ink"><input type="checkbox" checked={v.is_decision_maker} onChange={(e) => upd("is_decision_maker", e.target.checked)} className="accent-[var(--color-primary)]" /> Decision-maker</label>
        <label className="flex items-center gap-1.5 text-sm text-ink"><input type="checkbox" checked={v.do_not_contact} onChange={(e) => upd("do_not_contact", e.target.checked)} className="accent-[var(--color-primary)]" /> Do not contact</label>
        <button type="button" className="btn btn-primary btn-xs" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-link">Saved</span>}
      </div>
    </div>
  );
}
