import { customAlphabet } from "nanoid";

// 8-char base62, URL-safe, globally unique (planning.md §4).
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const newToken = customAlphabet(alphabet, 8);

/**
 * Build a deck link URL: https://<deck-domain>/?lead=<token>
 * The deck sites read the `lead` query param (persisted to localStorage and
 * attached to every Plausible event as the `lead` prop). It MUST be `?lead=` —
 * `?t=` is silently ignored by the decks, so the link would not track.
 */
export function buildLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/?lead=${token}`;
}
