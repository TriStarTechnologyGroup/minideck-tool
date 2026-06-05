import { z } from "zod";

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company: string | null;
  email: string;
  hubspot_id: string | null;
  hubspot_url: string | null;
  created_at: string;
}

export interface Link {
  id: string;
  token: string;
  deck_id: string;
  contact_id: string;
  full_url: string;
  created_at: string;
}

const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length ? v : null));

const email = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email address");

export const contactLinkInput = z.object({
  deckId: z.string().min(1),
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  position: optText,
  company: optText,
  email,
});

export type ContactLinkInput = z.infer<typeof contactLinkInput>;
