"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Deck } from "@/lib/decks";

type Props = { deck?: Deck };

export default function DeckForm({ deck }: Props) {
  const router = useRouter();
  const editing = Boolean(deck);

  const [name, setName] = useState(deck?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(deck?.base_url ?? "https://");
  const [slug, setSlug] = useState(deck?.slug ?? "");
  const [siteId, setSiteId] = useState(deck?.plausible_site_id ?? "");
  const [archived, setArchived] = useState(deck?.archived ?? false);

  const [busy, setBusy] = useState<null | "save" | "recapture" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setNotice(null);

    const payload = { name, base_url: baseUrl, slug, plausible_site_id: siteId, archived };
    const res = await fetch(editing ? `/api/decks/${deck!.id}` : "/api/decks", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error || "Something went wrong");
      setBusy(null);
      return;
    }
    router.push("/decks");
    router.refresh();
  }

  async function recapture() {
    if (!deck) return;
    setBusy("recapture");
    setError(null);
    setNotice(null);
    const res = await fetch("/api/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId: deck.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(json.error || "Capture failed");
    else {
      setNotice("Thumbnail re-captured.");
      router.refresh();
    }
  }

  async function remove() {
    if (!deck) return;
    if (!confirm(`Delete "${deck.name}"? This removes its links too.`)) return;
    setBusy("delete");
    setError(null);
    const res = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Delete failed");
      setBusy(null);
      return;
    }
    router.push("/decks");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <Field label="Name" value={name} onChange={setName} placeholder="HBS" required />
      <Field
        label="Base URL"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://hbs.tristargroup.us"
        type="url"
        required
        hint="https:// only. Used as the link base and screenshotted for the thumbnail."
      />
      <Field
        label="Slug"
        value={slug}
        onChange={setSlug}
        placeholder="hbs"
        required
        hint="Lowercase letters, numbers, hyphens. Must match data-deck in the deck repo."
      />
      <Field
        label="Plausible site ID"
        value={siteId}
        onChange={setSiteId}
        placeholder="hbs.tristargroup.us"
        required
        hint="The deck's Plausible site (its domain)."
      />

      {editing && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-[var(--color-primary)]" />
          Archived
        </label>
      )}

      {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p className="rounded-sm bg-surface-blue px-3 py-2 text-sm text-link">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" disabled={busy !== null} className="btn btn-primary">
          {busy === "save" ? "Saving…" : editing ? "Save changes" : "Create deck"}
        </button>

        {editing && (
          <>
            <button type="button" onClick={recapture} disabled={busy !== null} className="btn btn-ghost">
              {busy === "recapture" ? "Capturing…" : "Re-capture thumbnail"}
            </button>
            <button type="button" onClick={remove} disabled={busy !== null} className="btn btn-danger ml-auto">
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="field-label">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
