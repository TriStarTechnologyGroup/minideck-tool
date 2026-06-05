import { z } from "zod";

export interface Deck {
  id: string;
  name: string;
  base_url: string;
  slug: string;
  thumbnail_url: string | null;
  plausible_site_id: string;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const httpsUrl = z
  .string()
  .trim()
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid https:// URL");

export const deckInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  base_url: httpsUrl,
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  plausible_site_id: z.string().trim().min(1, "Plausible site ID is required"),
  archived: z.boolean().optional().default(false),
});

export const deckPatch = deckInput.partial();

export type DeckInput = z.infer<typeof deckInput>;
