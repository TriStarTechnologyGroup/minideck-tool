"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "./copy-button";

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
  const [form, setForm] = useState(EMPTY);

  // Typeahead state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HsResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Submit state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    copied: boolean;
    reused: boolean;
    hubspotWarning: string | null;
  } | null>(null);

  function set(k: keyof typeof EMPTY, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    // Editing fields means we're no longer pinned to a selected HubSpot record.
    if (linkedId) setLinkedId(null);
  }

  // Debounced HubSpot search as the user types. All state changes happen inside the
  // timer callback (async), never synchronously in the effect body.
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

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function selectResult(r: HsResult) {
    setForm({
      first_name: r.firstname,
      last_name: r.lastname,
      position: r.jobtitle,
      company: r.company,
      email: r.email,
    });
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
    setForm(EMPTY);
    setQuery("");
    setLinkedId(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-semibold">New link</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Typeahead */}
        <div ref={boxRef} className="relative">
          <label className="text-sm font-medium">Find a HubSpot contact</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Type a name or email…"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-300"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Pick an existing contact to autofill, or just fill the fields below to create a new one.
          </p>

          {open && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {searching && <div className="px-3 py-2 text-xs text-neutral-500">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="px-3 py-2 text-xs text-neutral-500">
                  No HubSpot matches.{" "}
                  <button type="button" onClick={startNew} className="underline">
                    Create “{query.trim()}” as new
                  </button>
                </div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectResult(r)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <span className="font-medium">
                    {`${r.firstname} ${r.lastname}`.trim() || "(no name)"}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {r.email}
                    {r.company ? ` · ${r.company}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {linkedId && (
          <p className="text-xs text-green-700 dark:text-green-400">
            ✓ Linked to existing HubSpot contact — fields autofilled.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="First name" value={form.first_name} onChange={(v) => set("first_name", v)} required />
          <Input placeholder="Last name" value={form.last_name} onChange={(v) => set("last_name", v)} required />
          <Input placeholder="Position" value={form.position} onChange={(v) => set("position", v)} />
          <Input placeholder="Company" value={form.company} onChange={(v) => set("company", v)} />
        </div>
        <Input placeholder="Email" type="email" value={form.email} onChange={(v) => set("email", v)} required />

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {busy ? "Generating…" : "Generate link"}
        </button>
      </form>

      {result && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm dark:bg-green-950/30">
          <span className="text-green-700 dark:text-green-300">
            {result.copied ? "Link copied to clipboard" : "Link ready"}
            {result.reused ? " (existing link reused)" : ""}:
          </span>
          <code className="truncate text-xs text-neutral-700 dark:text-neutral-300">{result.url}</code>
          {!result.copied && <CopyButton value={result.url} />}
          {result.hubspotWarning && (
            <span className="w-full text-xs text-amber-700 dark:text-amber-400">⚠ {result.hubspotWarning}</span>
          )}
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
      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-300"
    />
  );
}
