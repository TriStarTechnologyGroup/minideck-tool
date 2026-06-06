// Ordered slide-slug taxonomy per deck (mirrors public/track.js SLIDES). Used to render
// the full slide list (incl. unviewed) and compute "reached X of N" + "reached CTA".
export const SLIDE_SLUGS: Record<string, string[]> = {
  hbs: [
    "overview",
    "advanced-disease",
    "longitudinal",
    "primary-mets",
    "pre-post-soc",
    "pre-post-io",
    "stats",
    "cta",
  ],
  "ai-cohorts": [
    "overview",
    "imaging-clinical-data",
    "donor-profiles",
    "cohorts-available",
    "positioning",
    "repository",
    "core-partner",
    "scanning-capabilities",
    "stats",
    "advanced-disease",
    "longitudinal",
    "longitudinal-nsclc",
    "primary-mets",
    "pre-post-soc",
    "pre-post-io",
    "ffpe-tma-plasma",
    "cta",
  ],
};

export function slideCount(deckSlug: string): number {
  return SLIDE_SLUGS[deckSlug]?.length ?? 0;
}

/** Human-friendly label from a slug: "pre-post-soc" → "Pre Post Soc". */
export function slideLabel(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
