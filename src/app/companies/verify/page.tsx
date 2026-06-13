import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROSPECTABLE_COMPANY_TYPES } from "@/lib/guardrails";
import VerifyQueue, { type QueueCompany } from "./verify-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify companies — Minideck" };

// The scheduled prospecting queue only pulls verified, industry-typed, unflagged companies — so
// verifying those is what actually fills the pipeline. This queue focuses on exactly them, signal-rich
// ones first (existing opportunities / inquiries = clearly real), so the reviewer can blitz through.
export default async function VerifyCompaniesPage() {
  await requireUser();
  const supabase = await createClient();

  const [{ data: companies }, { data: oppRows }, { data: inqRows }] = await Promise.all([
    supabase.from("companies")
      .select("id, name, domain, website, industry, type, country, employees, hubspot_id")
      .in("type", PROSPECTABLE_COMPANY_TYPES as readonly string[] as string[])
      .eq("verified", false)
      .not("flagged_for_removal", "is", true)
      .limit(2000),
    supabase.from("opportunities").select("company_id").not("company_id", "is", null).limit(10000),
    supabase.from("inbound_inquiries").select("company_id").not("company_id", "is", null).limit(10000),
  ]);

  const oppCount = new Map<string, number>();
  for (const o of oppRows ?? []) oppCount.set(o.company_id as string, (oppCount.get(o.company_id as string) ?? 0) + 1);
  const inqCount = new Map<string, number>();
  for (const r of inqRows ?? []) inqCount.set(r.company_id as string, (inqCount.get(r.company_id as string) ?? 0) + 1);

  const queue = (companies ?? [])
    .map((c) => ({ ...c, opportunities: oppCount.get(c.id as string) ?? 0, inquiries: inqCount.get(c.id as string) ?? 0 }) as QueueCompany)
    .sort((a, b) => (b.opportunities + b.inquiries) - (a.opportunities + a.inquiries) || a.name.localeCompare(b.name));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <Link href="/companies" className="text-sm text-link hover:underline">← Companies</Link>
        <p className="eyebrow mt-2">Triage</p>
        <h1 className="mt-1 text-3xl">Verify companies</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Industry companies awaiting review. Verifying one adds it to the scheduled prospecting queue;
          flagging removes it from outreach. Signal-rich accounts come first. Keys: <kbd>V</kbd> verify ·
          {" "}<kbd>F</kbd> flag · <kbd>S</kbd> skip · <kbd>←</kbd> back.
        </p>
      </header>

      {queue.length === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-ink-muted">
          Nothing to verify — every industry company is reviewed. 🎉 <Link href="/companies" className="text-link hover:underline">Back to companies</Link>.
        </p>
      ) : (
        <VerifyQueue companies={queue} />
      )}
    </main>
  );
}
