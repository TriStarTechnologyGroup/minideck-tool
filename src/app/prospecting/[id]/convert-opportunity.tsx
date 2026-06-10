"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ContactRow = { first_name: string; last_name: string; position: string; email: string; role: "to" | "cc"; is_primary: boolean };
const blank = (primary = false): ContactRow => ({ first_name: "", last_name: "", position: "", email: "", role: primary ? "to" : "cc", is_primary: primary });

export default function ConvertOpportunity({
  companyId,
  defaults,
  campaigns,
  decks,
}: {
  companyId: string;
  defaults: { research: string; angle: string };
  campaigns: { id: string; name: string }[];
  decks: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(campaigns.length ? "existing" : "new");
  const [existingId, setExistingId] = useState(campaigns[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [warmth, setWarmth] = useState<"hot" | "warm" | "light">("warm");
  const [research, setResearch] = useState(defaults.research);
  const [angle, setAngle] = useState(defaults.angle);
  const [contacts, setContacts] = useState<ContactRow[]>([blank(true)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setContact(i: number, patch: Partial<ContactRow>) {
    setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : patch.is_primary ? { ...c, is_primary: false } : c)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const campaign = mode === "existing" ? { id: existingId } : { name: newName, deckId };
    const res = await fetch("/api/prospecting/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, campaign, warmth, research, angle, contacts }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error || "Conversion failed"); return; }
    router.push(`/campaigns/${json.campaignId}/accounts/${json.accountId}`);
  }

  if (!open) return <button type="button" className="btn btn-primary btn-xs" onClick={() => setOpen(true)}>Convert to campaign →</button>;

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-sm border border-line p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="field-label">Campaign</label>
          <div className="flex gap-3 text-sm">
            {campaigns.length > 0 && (
              <label className="flex items-center gap-1"><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing</label>
            )}
            <label className="flex items-center gap-1"><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New</label>
          </div>
        </div>
        {mode === "existing" ? (
          <div className="space-y-1.5 flex-1 min-w-[12rem]">
            <label className="field-label">Pick campaign</label>
            <select className="input" value={existingId} onChange={(e) => setExistingId(e.target.value)} required>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 flex-1 min-w-[10rem]">
              <label className="field-label">New campaign name</label>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Regeneron — MET/PD-L1" required />
            </div>
            <div className="space-y-1.5">
              <label className="field-label">Deck</label>
              <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)} required>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <label className="field-label">Warmth</label>
          <select className="input" value={warmth} onChange={(e) => setWarmth(e.target.value as "hot" | "warm" | "light")}>
            <option value="hot">Hot</option><option value="warm">Warm</option><option value="light">Light</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="field-label">Contacts (to / cc · pick one primary)</label>
        {contacts.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 min-w-[7rem]" placeholder="First" value={c.first_name} onChange={(e) => setContact(i, { first_name: e.target.value })} required />
            <input className="input flex-1 min-w-[7rem]" placeholder="Last" value={c.last_name} onChange={(e) => setContact(i, { last_name: e.target.value })} required />
            <input className="input flex-[2] min-w-[12rem]" type="email" placeholder="email" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} required />
            <input className="input flex-1 min-w-[8rem]" placeholder="Title" value={c.position} onChange={(e) => setContact(i, { position: e.target.value })} />
            <select className="input" value={c.role} onChange={(e) => setContact(i, { role: e.target.value as "to" | "cc" })}>
              <option value="to">to</option><option value="cc">cc</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-ink-muted">
              <input type="radio" name="cprimary" checked={c.is_primary} onChange={() => setContact(i, { is_primary: true })} /> primary
            </label>
            {contacts.length > 1 && <button type="button" className="btn btn-ghost btn-xs" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setContacts((cs) => [...cs, blank(false)])}>+ Add contact</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><label className="field-label">Research (from the opportunity)</label><textarea className="input" rows={3} value={research} onChange={(e) => setResearch(e.target.value)} /></div>
        <div className="space-y-1.5"><label className="field-label">Angle &amp; hooks</label><textarea className="input" rows={3} value={angle} onChange={(e) => setAngle(e.target.value)} /></div>
      </div>

      {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create account + link"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
