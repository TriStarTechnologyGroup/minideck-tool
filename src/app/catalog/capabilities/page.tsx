import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CatalogManager, { type Capability, type Tma } from "../catalog-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capabilities — Minideck" };

export default async function CatalogCapabilitiesPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: caps } = await supabase
    .from("capabilities")
    .select("id, capability_id, name, category, description, specs, matching_signal, solid_liquid, data_sheet, active, position, hubspot_product_id")
    .order("position");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Catalog</p>
        <h1 className="mt-1 text-3xl">Capabilities</h1>
        <p className="mt-1 text-sm text-ink-muted">
          TriStar&rsquo;s lab + biospecimen services the prospecting engine matches opportunities against.
          {profile.role === "admin" ? " Add, edit, and remove items." : " View-only — ask an admin to make changes."}
        </p>
      </header>
      <CatalogManager only="capabilities" tmas={[] as Tma[]} capabilities={(caps ?? []) as Capability[]} isAdmin={profile.role === "admin"} />
    </main>
  );
}
