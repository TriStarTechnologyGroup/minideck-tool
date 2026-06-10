import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Tma = {
  id: string; sku: string | null; ta_number: string | null; name: string | null;
  short_description: string | null; description: string | null; categories: string | null;
  primary_categories: string | null; product_cat: string | null; cancer: string | null;
  donor_samples_each: number | null; approx_cores: number | null; approx_donors: number | null;
  number_of_cores: string | null; number_of_donors: string | null; core_size: string | null;
  markers: string | null; suitable_for: string | null; suitable_for_codex: string | null;
  follow_up_data: string | null; molecular_data: string | null;
  images: string | null; gcp_dzi_file: string | null; data_sheet: string | null;
};

function stripHtml(s: string | null): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
const isUrl = (s: string | null) => !!s && /^https?:\/\//.test(s);

export default async function TmaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tma_catalog")
    .select("id, sku, ta_number, name, short_description, description, categories, primary_categories, product_cat, cancer, donor_samples_each, approx_cores, approx_donors, number_of_cores, number_of_donors, core_size, markers, suitable_for, suitable_for_codex, follow_up_data, molecular_data, images, gcp_dzi_file, data_sheet")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const t = data as Tma;

  const markers = (t.markers ?? "").split(/[,;]/).map((m) => m.trim()).filter(Boolean);
  const images = (t.images ?? "").split(/[,\s]+/).map((u) => u.trim()).filter((u) => isUrl(u));
  const facts: [string, string | null][] = [
    ["Cancer / tissue", t.cancer],
    ["Product category", t.product_cat ?? t.primary_categories],
    ["Donors", t.approx_donors != null ? String(t.approx_donors) : t.number_of_donors],
    ["Cores", t.approx_cores != null ? String(t.approx_cores) : t.number_of_cores],
    ["Samples / donor", t.donor_samples_each != null ? String(t.donor_samples_each) : null],
    ["Core size", t.core_size],
    ["Follow-up data", t.follow_up_data],
    ["Molecular data", t.molecular_data],
    ["Suitable for IHC / RNA-ISH", t.suitable_for],
    ["CODEX / GeoMx / CosMx", t.suitable_for_codex],
  ];
  const body = stripHtml(t.description);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/catalog" className="text-sm text-link hover:underline">← Catalog</Link>
        <h1 className="mt-2 text-2xl">{t.name ?? t.sku}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          {t.sku && <span className="chip bg-primary text-white font-mono">SKU {t.sku}</span>}
          {t.ta_number && <span className="chip bg-surface-blue-soft text-link font-mono">{t.ta_number}</span>}
          {(t.product_cat ?? t.primary_categories) && <span className="text-ink-muted">{t.product_cat ?? t.primary_categories}</span>}
        </div>
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={t.name ?? "TMA"} className="max-h-80 w-auto rounded-md border border-line" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.filter(([, v]) => v).map(([label, v]) => (
          <div key={label} className="rounded-md bg-surface-muted p-3">
            <div className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{label}</div>
            <div className="mt-0.5 text-base font-medium text-ink">{v}</div>
          </div>
        ))}
      </div>

      {markers.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-medium text-ink">Pre-characterized markers</h2>
          <div className="flex flex-wrap gap-1.5">
            {markers.map((m) => <span key={m} className="inline-flex items-center rounded-sm bg-surface-subtle px-2.5 py-1 text-sm text-ink">{m}</span>)}
          </div>
        </section>
      )}

      {(t.data_sheet || t.gcp_dzi_file) && (
        <section className="flex flex-wrap gap-4 text-sm">
          {isUrl(t.data_sheet) ? <a href={t.data_sheet!} target="_blank" rel="noreferrer" className="text-link hover:underline">↗ Data sheet</a> : t.data_sheet && <span className="text-ink-muted">Data sheet on file</span>}
          {t.gcp_dzi_file && (isUrl(t.gcp_dzi_file) ? <a href={t.gcp_dzi_file} target="_blank" rel="noreferrer" className="text-link hover:underline">↗ Scanned slide (deep-zoom)</a> : <span className="text-ink-muted">Scanned slide (deep-zoom) on file</span>)}
        </section>
      )}

      {t.short_description && (
        <section>
          <h2 className="mb-2 font-display text-base font-medium text-ink">Overview</h2>
          <p className="text-sm leading-relaxed text-ink">{t.short_description}</p>
        </section>
      )}

      {body && body !== t.short_description && (
        <section>
          <h2 className="mb-2 font-display text-base font-medium text-ink">Full description</h2>
          <p className="card whitespace-pre-line p-5 text-sm leading-relaxed text-ink-muted">{body}</p>
        </section>
      )}
    </main>
  );
}
