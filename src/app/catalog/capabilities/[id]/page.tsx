import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type Cap = {
  id: string; capability_id: string | null; name: string; category: string | null; description: string | null;
  specs: string | null; matching_signal: string | null; solid_liquid: string | null; data_sheet: string | null;
  active: boolean | null; position: number | null; hubspot_product_id: string | null;
};

export default async function CapabilityDetailPage({ params }: Ctx) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("capabilities")
    .select("id, capability_id, name, category, description, specs, matching_signal, solid_liquid, data_sheet, active, position, hubspot_product_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as Cap;

  // Opportunities that suggest this capability (by capability_id on opportunity_capabilities).
  let usedIn: { opportunity_id: string; asset_name: string | null; company_name: string | null }[] = [];
  if (c.capability_id) {
    const { data: rows } = await supabase
      .from("opportunity_capabilities")
      .select("opportunity_id, opportunities(asset_name, company_name)")
      .eq("capability_id", c.capability_id)
      .limit(100);
    usedIn = (rows ?? []).map((r) => {
      const o = (Array.isArray(r.opportunities) ? r.opportunities[0] : r.opportunities) as { asset_name: string | null; company_name: string | null } | null;
      return { opportunity_id: r.opportunity_id as string, asset_name: o?.asset_name ?? null, company_name: o?.company_name ?? null };
    });
  }

  const facts: [string, string | null][] = [
    ["Category", c.category], ["Solid / Liquid", c.solid_liquid], ["Specs", c.specs],
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/catalog/capabilities" className="text-sm text-link hover:underline">← Capabilities</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {c.capability_id && <span className="font-mono text-sm text-nav">{c.capability_id}</span>}
          <h1 className="text-3xl">{c.name}</h1>
          {c.active === false && <span className="chip bg-surface-muted text-ink-muted/70">inactive</span>}
          {c.hubspot_product_id && <span className="text-xs text-emerald-600" title="Linked to a HubSpot product">● HubSpot product</span>}
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

      {c.matching_signal && (
        <section>
          <h2 className="mb-2 font-display text-lg font-medium text-ink">When to suggest it</h2>
          <p className="card p-5 text-sm leading-relaxed text-ink">{c.matching_signal}</p>
        </section>
      )}

      {c.description && (
        <section>
          <h2 className="mb-2 font-display text-lg font-medium text-ink">Description</h2>
          <p className="card p-5 text-sm leading-relaxed text-ink">{c.description}</p>
        </section>
      )}

      {c.data_sheet && (
        <a href={c.data_sheet} target="_blank" rel="noreferrer" className="text-sm text-link hover:underline">Data sheet ↗</a>
      )}

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Suggested on opportunities <span className="font-sans text-sm font-normal text-ink-muted">({usedIn.length})</span>
        </h2>
        {usedIn.length === 0 ? (
          <p className="card px-5 py-6 text-sm text-ink-muted">Not yet suggested on any scored opportunity.</p>
        ) : (
          <div className="card divide-y divide-line">
            {usedIn.map((u) => (
              <Link key={u.opportunity_id} href={`/prospecting/opportunity/${u.opportunity_id}`} className="block px-4 py-2.5 text-sm hover:bg-surface-subtle">
                <span className="font-medium text-ink">{u.asset_name ?? "Opportunity"}</span>
                {u.company_name && <span className="text-ink-muted"> · {u.company_name}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
