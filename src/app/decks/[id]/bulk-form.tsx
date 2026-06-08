"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "@/components/copy-button";
import { parseContactsCsv, toCsv, downloadCsv, type ParsedContact } from "@/lib/csv";

type ResultRow = {
  email: string;
  name: string;
  company: string | null;
  status: "created" | "reused" | "error";
  full_url?: string;
  error?: string;
};
type Summary = { created: number; reused: number; failed: number; total: number };

const SAMPLE = "First Name,Last Name,Title,Company,Email\nJane,Doe,VP Research,Acme Bio,jane@acmebio.com";

export default function BulkForm({ deckId }: { deckId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{ rows: ParsedContact[]; errors: { line: number; reason: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function preview(t: string) {
    setText(t);
    setResults(null);
    setSummary(null);
    setError(null);
    setParsed(t.trim() ? parseContactsCsv(t) : null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    preview(await f.text());
  }

  async function generate() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId, rows: parsed.rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk generation failed");
      setResults(json.results);
      setSummary(json.summary);
      router.refresh(); // reflect new links in the table below
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const okLinks = (results ?? []).filter((r) => r.full_url);
  function copyAll() {
    navigator.clipboard.writeText(okLinks.map((r) => r.full_url).join("\n"));
  }
  function exportCsv() {
    const csv = toCsv(
      [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "company", label: "Company" },
        { key: "status", label: "Status" },
        { key: "full_url", label: "Link" },
        { key: "error", label: "Error" },
      ],
      (results ?? []) as unknown as Record<string, unknown>[],
    );
    downloadCsv("minideck-bulk-links.csv", csv);
  }

  return (
    <details className="card group p-0">
      <summary className="cursor-pointer px-5 py-3 font-display text-base font-medium text-ink">
        Bulk add <span className="font-sans text-sm font-normal text-ink-muted">— paste or upload a CSV to mint many links at once</span>
      </summary>
      <div className="space-y-3 border-t border-line p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Header row required. Columns: <code>First Name, Last Name, Title, Company, Email</code> (email required). Up to 500 rows.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => preview(SAMPLE)}>
              Insert sample
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()}>
              Upload .csv
            </button>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => preview(e.target.value)}
          rows={6}
          placeholder={SAMPLE}
          className="input w-full font-mono text-xs"
        />

        {parsed && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink">
              <strong>{parsed.rows.length}</strong> valid row{parsed.rows.length === 1 ? "" : "s"}
            </span>
            {parsed.errors.length > 0 && (
              <span className="text-danger">{parsed.errors.length} skipped</span>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={busy || parsed.rows.length === 0}
              className="btn btn-primary btn-sm ml-auto"
            >
              {busy ? "Generating…" : `Generate ${parsed.rows.length} link${parsed.rows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {parsed && parsed.errors.length > 0 && (
          <ul className="max-h-24 overflow-y-auto rounded-sm bg-danger-bg px-3 py-2 text-xs text-danger">
            {parsed.errors.slice(0, 20).map((e, i) => (
              <li key={i}>Line {e.line}: {e.reason}</li>
            ))}
            {parsed.errors.length > 20 && <li>…and {parsed.errors.length - 20} more</li>}
          </ul>
        )}

        {error && <p className="rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        {summary && (
          <div className="space-y-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="chip bg-surface-blue-soft text-link">{summary.created} created</span>
              <span className="chip bg-surface-muted text-ink-muted">{summary.reused} reused</span>
              {summary.failed > 0 && <span className="chip bg-danger-bg text-danger">{summary.failed} failed</span>}
              <div className="ml-auto flex gap-2">
                <button type="button" className="btn btn-ghost btn-xs" onClick={copyAll} disabled={okLinks.length === 0}>
                  Copy all links
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={exportCsv}>
                  Download CSV
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-sm border border-line">
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-line">
                  {results!.map((r, i) => (
                    <tr key={i} className="align-middle">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-ink">{r.name}</div>
                        <div className="text-ink-muted">{r.email}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        {r.status === "error" ? (
                          <span className="text-danger">{r.error}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <code className="max-w-[14rem] truncate text-ink-muted">{r.full_url}</code>
                            {r.full_url && <CopyButton value={r.full_url} />}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span
                          className={`chip ${
                            r.status === "created"
                              ? "bg-surface-blue-soft text-link"
                              : r.status === "reused"
                                ? "bg-surface-muted text-ink-muted"
                                : "bg-danger-bg text-danger"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
