import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CatalogManager, { type Capability, type Tma } from "./catalog-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog — Minideck" };

export default async function CatalogPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const [{ data: caps }, { data: tmas }] = await Promise.all([
    supabase.from("capabilities").select("id, capability_id, name, category, description, hubspot_product_id").order("capability_id"),
    supabase.from("tma_catalog").select("id, sku, ta_number, name, short_description, description, categories, primary_categories, product_cat, cancer, donor_samples_each, approx_cores, approx_donors, number_of_cores, number_of_donors, core_size, markers, suitable_for, suitable_for_codex, follow_up_data, molecular_data, images, data_sheet, gcp_dzi_file, hubspot_product_id").order("sku"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Reference data</p>
        <h1 className="mt-1 text-3xl">Catalog</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The TMA catalog and capabilities the prospecting engine matches opportunities against.
          {profile.role === "admin" ? " Add, edit, and remove items." : " View-only — ask an admin to make changes."}
        </p>
      </header>
      <CatalogManager tmas={(tmas ?? []) as Tma[]} capabilities={(caps ?? []) as Capability[]} isAdmin={profile.role === "admin"} />
    </main>
  );
}
