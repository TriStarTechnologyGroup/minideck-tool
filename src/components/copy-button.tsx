"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

export default function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast("Link copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={copy} className="btn btn-ghost btn-xs">
      {copied ? "Copied ✓" : label}
    </button>
  );
}
