import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Tma = {
  id: string; sku: string | null; ta_number: string | null; name: string | null;
  short_description: string | null; description: string | null; categories: string | null;
  donor_samples_each: number | null; approx_cores: number | null; approx_donors: number | null;
  core_size: string | null; markers: string | null; primary_categories: string | null; suitable_for: string | null;
};

// Catalog descriptions are stored as HTML; render as plain text (no raw HTML injection).
function stripHtml(s: string | null): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export default async function TmaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("tma_catalog")
    .select("id, sku, ta_number, name, short_description, description, categories, donor_samples_each, approx_cores, approx_donors, core_size, markers, primary_categories, suitable_for")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const t = data as Tma;

  const markers = (t.markers ?? "").split(/[,;]/).map((m) => m.trim()).filter(Boolean);
  const stats: [string, string | null][] = [
    ["Donors", t.approx_donors != null ? String(t.approx_donors) : null],
    ["Cores", t.approx_cores != null ? String(t.approx_cores) : null],
    ["Samples / donor", t.donor_samples_each != null ? String(t.donor_samples_each) : null],
    ["Core size", t.core_size],
    ["Suitable for", t.suitable_for],
  ];
  const body = stripHtml(t.description);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/prospecting" className="text-sm text-link hover:underline">← Prospecting</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">{t.name ?? t.ta_number}</h1>
          {t.ta_number && <span className="chip bg-surface-blue-soft text-link font-mono">{t.ta_number}</span>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {t.primary_categories ?? t.categories ?? "Tissue Microarray"}{t.sku ? ` · SKU ${t.sku}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.filter(([, v]) => v).map(([label, v]) => (
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
            {markers.map((m) => (
              <span key={m} className="inline-flex items-center rounded-sm bg-surface-subtle px-2.5 py-1 text-sm text-ink">{m}</span>
            ))}
          </div>
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
