"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export default function GenerateButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/cron/digest");
      const j = await res.json();
      if (res.ok) { toast(`Digest generated${j.pushed ? " + pushed" : ""}`); router.refresh(); }
      else toast(j.error ?? "Failed");
    } finally { setBusy(false); }
  }
  return <button className="btn btn-primary btn-xs" disabled={busy} onClick={run}>{busy ? "Generating…" : "Generate now"}</button>;
}
