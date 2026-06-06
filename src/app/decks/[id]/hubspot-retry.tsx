"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HubspotRetry({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/contacts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Sync failed");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-danger" title={err ?? undefined}>
        not synced
      </span>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="text-link underline underline-offset-2 hover:no-underline disabled:opacity-50"
      >
        {busy ? "syncing…" : "Retry"}
      </button>
    </span>
  );
}
