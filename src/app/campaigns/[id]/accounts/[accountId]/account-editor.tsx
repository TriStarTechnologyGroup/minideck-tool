"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { touchDueDate } from "@/lib/cadence";
import FeedbackButtons from "@/components/feedback-buttons";

export type TouchData = { id: string; seq: number; day_offset: number; subject: string | null; body: string | null; status: string; sent_at: string | null };
type Draft = { id: string; seq: number; subject: string; body: string };

/** Build a Gmail compose URL (opens a new message prefilled with to/cc/subject/body). */
function gmailComposeUrl(to: string[], cc: string[], subject: string, body: string): string {
  const parts = ["view=cm", "fs=1", `to=${encodeURIComponent(to.join(","))}`];
  if (cc.length) parts.push(`cc=${encodeURIComponent(cc.join(","))}`);
  parts.push(`su=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`);
  return `https://mail.google.com/mail/?${parts.join("&")}`;
}

export default function AccountEditor({
  accountId, startedAt, research, context, angle, touches, toEmails, ccEmails,
}: {
  accountId: string; startedAt: string | null; research: string; context: string; angle: string;
  touches: TouchData[]; toEmails: string[]; ccEmails: string[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState({ research, context, angle });
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsSaved, setFieldsSaved] = useState(false);

  // AI touch editing
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bump to remount touches after applying drafts

  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function saveFields() {
    setSavingFields(true); setFieldsSaved(false);
    await fetch(`/api/accounts/${accountId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    setSavingFields(false); setFieldsSaved(true); router.refresh();
  }

  async function generate() {
    setGenerating(true); setAiError(null);
    try {
      const res = await fetch("/api/touches/ai-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, touchIds: [...selected], prompt }) });
      const j = await res.json();
      if (!res.ok) setAiError(j.error ?? `Error ${res.status}`);
      else setDrafts((j.drafts as Draft[]).sort((a, b) => a.seq - b.seq));
    } catch (e) { setAiError(e instanceof Error ? e.message : String(e)); }
    finally { setGenerating(false); }
  }

  const editDraft = (id: string, field: "subject" | "body", val: string) =>
    setDrafts((d) => d?.map((x) => (x.id === id ? { ...x, [field]: val } : x)) ?? null);

  async function applyDrafts() {
    if (!drafts) return;
    setApplying(true);
    try {
      await Promise.all(drafts.map((d) =>
        fetch(`/api/touches/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: d.subject, body: d.body }) })));
      setDrafts(null); setSelected(new Set()); setPrompt("");
      router.refresh(); setVersion((v) => v + 1);
    } finally { setApplying(false); }
  }

  return (
    <>
      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium text-ink">Research · Context · Angle</h2>
        <div className="space-y-3">
          <Area label="Verified research" v={fields.research} on={(v) => setFields((f) => ({ ...f, research: v }))} />
          <Area label="ASCO context" v={fields.context} on={(v) => setFields((f) => ({ ...f, context: v }))} />
          <Area label="Angle &amp; hooks" v={fields.angle} on={(v) => setFields((f) => ({ ...f, angle: v }))} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary btn-sm" onClick={saveFields} disabled={savingFields}>{savingFields ? "Saving…" : "Save"}</button>
          {fieldsSaved && <span className="text-xs text-link">Saved</span>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-ink">Cadence</h2>
          {selected.size > 0 && !drafts && <span className="text-xs text-ink-muted">{selected.size} selected for AI edit</span>}
        </div>
        {!startedAt && <p className="text-xs text-ink-muted">Mark Touch 1 sent to start the cadence clock (Touch 2 = +4d, Touch 3 = +9d). Tick the boxes to edit touches with Claude.</p>}

        {/* AI edit prompt bar */}
        {selected.size > 0 && !drafts && (
          <div className="card flex flex-col gap-2 border-primary/30 bg-surface-blue-soft/30 p-3">
            <label className="field-label">Edit {selected.size} touch{selected.size === 1 ? "" : "es"} with Claude — describe the change &amp; why</label>
            <textarea className="input w-full" rows={2} placeholder="e.g. Make Touch 1 shorter and lead with the matched-mets angle; warmer tone; tighten the CTA." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary btn-xs" onClick={generate} disabled={generating || !prompt.trim()}>{generating ? "Drafting…" : "Generate draft"}</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setSelected(new Set())} disabled={generating}>Clear selection</button>
              {aiError && <span className="text-xs text-red-600">{aiError}</span>}
            </div>
          </div>
        )}

        {/* Draft review — editable before replacing */}
        {drafts && (
          <div className="card flex flex-col gap-3 border-primary/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Proposed drafts — review &amp; revise before replacing</span>
              <span className="chip bg-surface-blue-soft text-link text-[0.6rem]">not saved yet</span>
            </div>
            {drafts.map((d) => (
              <div key={d.id} className="rounded-md border border-line p-2.5">
                <div className="mb-1 text-xs font-medium text-ink-muted">Touch {d.seq}</div>
                <input className="input mb-2 w-full text-sm" value={d.subject} onChange={(e) => editDraft(d.id, "subject", e.target.value)} />
                <textarea className="input w-full font-mono text-xs" rows={6} value={d.body} onChange={(e) => editDraft(d.id, "body", e.target.value)} />
                <div className="mt-1.5"><FeedbackButtons area="touch_quality" input={{ subject: d.subject, body: d.body, angle }} label="Rate draft:" /></div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary btn-xs" onClick={applyDrafts} disabled={applying}>{applying ? "Replacing…" : `Replace ${drafts.length} touch${drafts.length === 1 ? "" : "es"}`}</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setDrafts(null)} disabled={applying}>Discard</button>
              <button className="btn btn-secondary btn-xs" onClick={generate} disabled={applying || generating}>{generating ? "…" : "Regenerate"}</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {touches.map((t) => (
            <Touch key={`${t.id}-${version}`} t={t} startedAt={startedAt} toEmails={toEmails} ccEmails={ccEmails}
              selected={selected.has(t.id)} onToggleSelect={() => toggleSelect(t.id)} onChange={() => router.refresh()} />
          ))}
        </div>
      </section>
    </>
  );
}

function Area({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="field-label">{label}</label>
      <textarea className="input w-full" rows={3} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

function Touch({ t, startedAt, toEmails, ccEmails, selected, onToggleSelect, onChange }: { t: TouchData; startedAt: string | null; toEmails: string[]; ccEmails: string[]; selected: boolean; onToggleSelect: () => void; onChange: () => void }) {
  const [subject, setSubject] = useState(t.subject ?? "");
  const [body, setBody] = useState(t.body ?? "");
  const [busy, setBusy] = useState<null | "save" | "send">(null);
  const due = touchDueDate(startedAt, t.day_offset);
  const sent = t.status === "sent";

  function openGmail() { window.open(gmailComposeUrl(toEmails, ccEmails, subject, body), "_blank", "noopener"); }

  async function patch(payload: Record<string, unknown>, which: "save" | "send") {
    setBusy(which);
    await fetch(`/api/touches/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(null);
    onChange();
  }

  return (
    <div className={`card p-4 ${selected ? "border-primary" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="accent-[var(--color-primary)]" aria-label={`Select Touch ${t.seq} for AI edit`} />
          Touch {t.seq} <span className="font-normal text-ink-muted">· Day +{t.day_offset}{due ? ` · due ${new Date(due).toLocaleDateString()}` : ""}</span>
        </label>
        {sent ? (
          <span className="chip bg-surface-blue-soft text-link">sent {t.sent_at ? new Date(t.sent_at).toLocaleDateString() : ""}</span>
        ) : (
          <button className="btn btn-ghost btn-xs" onClick={() => patch({ status: "sent" }, "send")} disabled={busy !== null}>
            {busy === "send" ? "…" : "Mark sent"}
          </button>
        )}
      </div>
      <input className="input mb-2 w-full text-sm" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="input w-full font-mono text-xs" rows={6} placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-xs" onClick={openGmail} disabled={toEmails.length === 0} title={toEmails.length === 0 ? "No 'to' recipients on this account" : "Opens Gmail with to, cc, subject and body filled in"}>
          ✉ Open in Gmail
        </button>
        <button className="btn btn-ghost btn-xs" onClick={() => patch({ subject, body }, "save")} disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save draft"}</button>
        <button className="btn btn-ghost btn-xs" onClick={() => navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)}>Copy</button>
      </div>
    </div>
  );
}
