import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ContactEditor, { type EditableContact } from "./contact-editor";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function ContactProfilePage({ params }: Ctx) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, full_name, first_name, last_name, email, position, function, seniority, is_decision_maker, do_not_contact, linkedin_url, location, source, hubspot_url, notes, company_id, company")
    .eq("id", id)
    .maybeSingle();
  if (!contact) notFound();
  const c = contact as Record<string, unknown> & EditableContact & { full_name: string | null; email: string | null; company_id: string | null; company: string | null; hubspot_url: string | null; source: string | null; location: string | null };

  const [{ data: company }, { data: oppLinks }, { data: inquiries }, { data: fnRows }] = await Promise.all([
    c.company_id ? supabase.from("companies").select("id, name, type, verified").eq("id", c.company_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("opportunity_contacts").select("relevance, role, opportunities(id, asset_name, company_name, fit_tier)").eq("contact_id", id).limit(100),
    c.email ? supabase.from("inbound_inquiries").select("id, source, subject, received_at, opportunity_id").eq("contact_email", c.email).order("received_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    supabase.from("contacts").select("function").not("function", "is", null).limit(2000),
  ]);
  const functions = [...new Set((fnRows ?? []).map((r) => r.function as string).filter(Boolean))].sort();

  const facts: [string, string | null][] = [
    ["Seniority", c.seniority], ["Function", c.function], ["Location", c.location],
    ["Source", c.source], ["Email", c.email],
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/contacts" className="text-sm text-link hover:underline">← Contacts</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{c.full_name || c.email || "Contact"}</h1>
          {c.is_decision_maker && <span className="chip bg-primary text-white">decision-maker</span>}
          {c.do_not_contact && <span className="chip bg-red-100 text-red-700">do not contact</span>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {c.position ?? "—"}
          {company && <> · <Link href={`/prospecting/${company.id}`} className="text-link hover:underline">{company.name}</Link>{company.verified && <span className="ml-1 text-emerald-600" title="Verified company">✓</span>}</>}
          {!company && c.company && <> · {c.company}</>}
        </p>
        <div className="mt-1 flex gap-3 text-sm">
          {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-link hover:underline">LinkedIn ↗</a>}
          {c.hubspot_url && <a href={c.hubspot_url} target="_blank" rel="noreferrer" className="text-link hover:underline">HubSpot ↗</a>}
        </div>
      </div>

      <div className="card flex flex-wrap gap-x-8 gap-y-3 p-5">
        {facts.filter(([, v]) => v).map(([label, v]) => (
          <div key={label} className="min-w-[8rem]">
            <div className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{label}</div>
            <div className="text-sm text-ink">{v}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Edit</h2>
        <ContactEditor contact={c} functions={functions} />
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Relevant opportunities <span className="font-sans text-sm font-normal text-ink-muted">({(oppLinks ?? []).length})</span></h2>
        {(oppLinks ?? []).length === 0 ? (
          <p className="card px-5 py-6 text-sm text-ink-muted">Not yet linked to any opportunity. (Enrichment will map relevant POCs to opportunities.)</p>
        ) : (
          <div className="card divide-y divide-line">
            {(oppLinks ?? []).map((l, i) => {
              const o = (Array.isArray(l.opportunities) ? l.opportunities[0] : l.opportunities) as { id: string; asset_name: string | null; company_name: string | null; fit_tier: string | null } | null;
              if (!o) return null;
              return (
                <Link key={i} href={`/prospecting/opportunity/${o.id}`} className="block px-4 py-2.5 text-sm hover:bg-surface-subtle">
                  <span className="font-medium text-ink">{o.asset_name ?? "Opportunity"}</span>
                  {o.company_name && <span className="text-ink-muted"> · {o.company_name}</span>}
                  {l.role && <span className="text-ink-muted"> — {l.role}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Inbound inquiries <span className="font-sans text-sm font-normal text-ink-muted">({(inquiries ?? []).length})</span></h2>
        {(inquiries ?? []).length === 0 ? (
          <p className="card px-5 py-6 text-sm text-ink-muted">No inbound inquiries from this contact.</p>
        ) : (
          <div className="card divide-y divide-line">
            {(inquiries ?? []).map((q) => (
              <div key={q.id as string} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-ink">{(q.subject as string) ?? (q.source === "rfq" ? "RFQ" : "Inquiry")}</span>
                <span className="flex items-center gap-3 text-xs text-ink-muted">
                  {q.received_at ? new Date(q.received_at as string).toLocaleDateString() : ""}
                  {q.opportunity_id && <Link href={`/prospecting/opportunity/${q.opportunity_id}`} className="text-link hover:underline">opportunity ↗</Link>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
