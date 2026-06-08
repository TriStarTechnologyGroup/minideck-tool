"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { touchDueDate } from "@/lib/cadence";

export type TouchData = { id: string; seq: number; day_offset: number; subject: string | null; body: string | null; status: string; sent_at: string | null };

/** Build a Gmail compose URL (opens a new message prefilled with to/cc/subject/body). */
function gmailComposeUrl(to: string[], cc: string[], subject: string, body: string): string {
  const parts = ["view=cm", "fs=1", `to=${encodeURIComponent(to.join(","))}`];
  if (cc.length) parts.push(`cc=${encodeURIComponent(cc.join(","))}`);
  parts.push(`su=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`);
  return `https://mail.google.com/mail/?${parts.join("&")}`;
}

export default function AccountEditor({
  accountId,
  startedAt,
  research,
  context,
  angle,
  touches,
  toEmails,
  ccEmails,
}: {
  accountId: string;
  startedAt: string | null;
  research: string;
  context: string;
  angle: string;
  touches: TouchData[];
  toEmails: string[];
  ccEmails: string[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState({ research, context, angle });
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsSaved, setFieldsSaved] = useState(false);

  async function saveFields() {
    setSavingFields(true);
    setFieldsSaved(false);
    await fetch(`/api/accounts/${accountId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    setSavingFields(false);
    setFieldsSaved(true);
    router.refresh();
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
        <h2 className="font-display text-lg font-medium text-ink">Cadence</h2>
        {!startedAt && <p className="text-xs text-ink-muted">Mark Touch 1 sent to start the cadence clock (Touch 2 = +4d, Touch 3 = +9d).</p>}
        <div className="space-y-3">
          {touches.map((t) => (
            <Touch key={t.id} t={t} startedAt={startedAt} toEmails={toEmails} ccEmails={ccEmails} onChange={() => router.refresh()} />
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

function Touch({ t, startedAt, toEmails, ccEmails, onChange }: { t: TouchData; startedAt: string | null; toEmails: string[]; ccEmails: string[]; onChange: () => void }) {
  const [subject, setSubject] = useState(t.subject ?? "");
  const [body, setBody] = useState(t.body ?? "");
  const [busy, setBusy] = useState<null | "save" | "send">(null);
  const due = touchDueDate(startedAt, t.day_offset);
  const sent = t.status === "sent";

  function openGmail() {
    window.open(gmailComposeUrl(toEmails, ccEmails, subject, body), "_blank", "noopener");
  }

  async function patch(payload: Record<string, unknown>, which: "save" | "send") {
    setBusy(which);
    await fetch(`/api/touches/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(null);
    onChange();
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-ink">
          Touch {t.seq} <span className="font-normal text-ink-muted">· Day +{t.day_offset}{due ? ` · due ${new Date(due).toLocaleDateString()}` : ""}</span>
        </div>
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
