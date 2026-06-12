import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import OpportunityList, { type Opp } from "./opportunity-list";
import ProgramTable, { type Program } from "./program-table";
import ScopeContacts from "./scope-contacts";

export const dynamic = "force-dynamic";

type Company = {
  id: string; name: string; domain: string | null; website: string | null; industry: string | null;
  lifecycle_stage: string | null; owner: string | null; employees: number | null; country: string | null;
  pipeline_program_count: number | null; notes: string | null;
};

export default async function CompanyProspectingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, domain, website, industry, lifecycle_stage, owner, employees, country, pipeline_program_count, notes")
    .eq("id", id)
    .maybeSingle();
  if (!company) notFound();
  const c = company as Company;

  const [{ data: programs }, { data: opportunities }, { data: campaignList }, { data: deckList }, { data: contactRows }] = await Promise.all([
    supabase.from("drug_programs").select("id, asset_name, modality, target, highest_phase, tumor_types, in_window, proprietary").eq("company_id", id).limit(500),
    supabase.from("opportunities").select("id, asset_name, target, modality, phase, fit_score, fit_tier, proprietary, matched_tma_skus, suggested_capabilities, rationale").eq("company_id", id).limit(200),
    supabase.from("campaigns").select("id, name").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("decks").select("id, name").eq("archived", false).order("name"),
    supabase.from("contacts").select("id, full_name, email, position, function, is_decision_maker, do_not_contact").eq("company_id", id).order("is_decision_maker", { ascending: false }).limit(200),
  ]);
  const progs = (programs ?? []) as Program[];
  const contacts = (contactRows ?? []) as { id: string; full_name: string | null; email: string | null; position: string | null; function: string | null; is_decision_maker: boolean | null; do_not_contact: boolean | null }[];
  const opps = ((opportunities ?? []) as Opp[]).sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));
  const campaigns = (campaignList ?? []) as { id: string; name: string }[];
  const decks = (deckList ?? []) as { id: string; name: string }[];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/prospecting" className="text-sm text-link hover:underline">← Opportunities</Link>
        <h1 className="mt-2 text-3xl">{c.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {[c.industry, c.lifecycle_stage, c.country, c.employees ? `${c.employees} employees` : null].filter(Boolean).join(" · ") || "—"}
          {c.domain && <> · <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-link hover:underline">{c.domain}</a></>}
          {c.owner && <> · owner {c.owner}</>}
        </p>
        {c.notes && <p className="mt-2 text-sm text-ink-muted">{c.notes}</p>}
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Opportunities <span className="font-sans text-sm font-normal text-ink-muted">({opps.length})</span>
        </h2>
        <OpportunityList companyId={c.id} opps={opps} campaigns={campaigns} decks={decks} />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-ink">
            Contacts <span className="font-sans text-sm font-normal text-ink-muted">({contacts.length})</span>
          </h2>
          <ScopeContacts companyId={c.id} />
        </div>
        {contacts.length === 0 ? (
          <p className="card px-5 py-6 text-sm text-ink-muted">No contacts yet. Enrichment will pull decision-makers for verified companies.</p>
        ) : (
          <div className="card divide-y divide-line">
            {contacts.map((p) => (
              <Link key={p.id} href={`/contacts/${p.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-surface-subtle">
                <span className="font-medium text-ink">{p.full_name || p.email || "—"}</span>
                {p.position && <span className="text-ink-muted">· {p.position}</span>}
                {p.function && <span className="chip bg-surface-muted text-nav text-[0.6rem]">{p.function}</span>}
                {p.is_decision_maker && <span className="chip bg-primary text-white text-[0.55rem]">DM</span>}
                {p.do_not_contact && <span className="chip bg-red-100 text-red-700 text-[0.55rem]">DNC</span>}
                {p.email && <span className="ml-auto text-xs text-ink-muted">{p.email}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Drug programs <span className="font-sans text-sm font-normal text-ink-muted">({progs.length})</span>
        </h2>
        <ProgramTable programs={progs} />
      </section>
    </main>
  );
}
