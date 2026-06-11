"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual trigger for the inbound sync (also runs every 15 min via Vercel cron).
export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/inbound/sync", { method: "POST" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setMsg(`+${j.inserted} new · ${j.updated} updated${j.errors?.length ? ` · ${j.errors.length} err` : ""}`); router.refresh(); }
    else setMsg(j?.error ?? "Sync failed");
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      {msg && <span className="text-ink-muted">{msg}</span>}
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={run}>{busy ? "Syncing…" : "Sync now"}</button>
    </div>
  );
}
