"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type DeckOpt = { id: string; name: string };

export default function CampaignForm({ decks }: { decks: DeckOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, deckId, sender_label: sender || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error || "Failed"); return; }
    router.push(`/campaigns/${json.campaign.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={decks.length === 0}>
        + New campaign
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="space-y-1.5">
        <label className="field-label">Campaign name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ASCO 2026 follow-up" required />
      </div>
      <div className="space-y-1.5">
        <label className="field-label">Deck</label>
        <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)} required>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="field-label">Sender (optional)</label>
        <input className="input" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Shaan Bhagat" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
