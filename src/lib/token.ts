import { customAlphabet } from "nanoid";

// 8-char base62, URL-safe, globally unique (planning.md §4).
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const newToken = customAlphabet(alphabet, 8);

/**
 * Build a deck link URL: https://<deck-domain>/?t=<token>
 * The decks load track.js, which reads the `t` query param (persisted to
 * localStorage as `tristar_t`) and attaches it to every event/beacon as the
 * `token` prop — the same convention the artifact /data/ pages and the
 * Plausible stats queries use. Must be `?t=`.
 */
export function buildLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/?t=${token}`;
}
