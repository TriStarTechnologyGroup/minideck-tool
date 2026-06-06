"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/copy-button";
import { useToast } from "@/components/toast";

const EMPTY = { first_name: "", last_name: "", position: "", company: "", email: "" };

type HsResult = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  jobtitle: string;
  company: string;
};

export default function NewLinkForm({ deckId }: { deckId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HsResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; copied: boolean; reused: boolean; hubspotWarning: string | null } | null>(null);

  function set(k: keyof typeof EMPTY, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    if (linkedId) setLinkedId(null);
  }

  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/hubspot/contacts/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function selectResult(r: HsResult) {
    setForm({ first_name: r.firstname, last_name: r.lastname, position: r.jobtitle, company: r.company, email: r.email });
    setLinkedId(r.id);
    setQuery(`${r.firstname} ${r.lastname}`.trim() || r.email);
    setOpen(false);
  }

  function startNew() {
    setForm(EMPTY);
    setLinkedId(null);
    setOpen(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, ...form }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Something went wrong");
      setBusy(false);
      return;
    }

    const url: string = json.link.full_url;
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }

    setResult({ url, copied, reused: Boolean(json.reused), hubspotWarning: json.hubspotWarning ?? null });
    toast(copied ? (json.reused ? "Existing link copied" : "Link created & copied") : "Link ready");
    setForm(EMPTY);
    setQuery("");
    setLinkedId(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card p-5">
      <h2 className="mb-4 font-display text-lg font-medium text-ink">New link</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <div ref={boxRef} className="relative">
          <label className="field-label">Find a HubSpot contact</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Type a name or email…"
            className="input mt-1.5"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Pick an existing contact to autofill, or fill the fields below to create a new one.
          </p>

          {open && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-sm border border-line bg-surface shadow-[var(--shadow-pop)]">
              {searching && <div className="px-3 py-2 text-xs text-ink-muted">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="px-3 py-2 text-xs text-ink-muted">
                  No HubSpot matches.{" "}
                  <button type="button" onClick={startNew} className="text-link underline">
                    Create “{query.trim()}” as new
                  </button>
                </div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectResult(r)}
                  className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover"
                >
                  <span className="font-medium text-ink">{`${r.firstname} ${r.lastname}`.trim() || "(no name)"}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {r.email}
                    {r.company ? ` · ${r.company}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {linkedId && <p className="text-xs font-medium text-link">✓ Linked to existing HubSpot contact — fields autofilled.</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="First name" value={form.first_name} onChange={(v) => set("first_name", v)} required />
          <Input placeholder="Last name" value={form.last_name} onChange={(v) => set("last_name", v)} required />
          <Input placeholder="Position" value={form.position} onChange={(v) => set("position", v)} />
          <Input placeholder="Company" value={form.company} onChange={(v) => set("company", v)} />
        </div>
        <Input placeholder="Email" type="email" value={form.email} onChange={(v) => set("email", v)} required />

        {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Generating…" : "Generate link"}
        </button>
      </form>

      {result && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm bg-surface-blue px-3 py-2.5 text-sm">
          <span className="font-medium text-ink">
            {result.copied ? "Link copied to clipboard" : "Link ready"}
            {result.reused ? " (existing link reused)" : ""}:
          </span>
          <code className="truncate text-xs text-ink-muted">{result.url}</code>
          {!result.copied && <CopyButton value={result.url} />}
          {result.hubspotWarning && <span className="w-full text-xs text-danger">⚠ {result.hubspotWarning}</span>}
        </div>
      )}
    </div>
  );
}

function Input({
  placeholder,
  value,
  onChange,
  type = "text",
  required,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input"
    />
  );
}
