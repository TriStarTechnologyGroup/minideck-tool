"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

// 👍/👎 on a live LLM output → a labeled example in the area's judge golden set. Drop next to any
// generated artifact (a touch draft, an opportunity). Optimistic + idempotent (re-rating updates).
export default function FeedbackButtons({ area, input, label = "Rate for evals:" }: { area: string; input: Record<string, unknown>; label?: string }) {
  const toast = useToast();
  const [sent, setSent] = useState<null | "pass" | "fail">(null);
  const [busy, setBusy] = useState(false);

  async function send(verdict: "pass" | "fail") {
    setBusy(true);
    try {
      const res = await fetch("/api/evals/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area, input, verdict }) });
      if (res.ok) { setSent(verdict); toast("Saved to evals — thanks!"); }
      else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Couldn't save feedback"); }
    } catch { toast("Couldn't save feedback"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
      <span>{label}</span>
      <button type="button" className={`btn btn-ghost btn-xs ${sent === "pass" ? "text-emerald-600" : ""}`} disabled={busy || sent != null} onClick={() => send("pass")} aria-label="Good" title="Good output">👍</button>
      <button type="button" className={`btn btn-ghost btn-xs ${sent === "fail" ? "text-red-600" : ""}`} disabled={busy || sent != null} onClick={() => send("fail")} aria-label="Needs work" title="Needs work">👎</button>
      {sent && <span className="text-ink-muted/70">recorded</span>}
    </div>
  );
}
