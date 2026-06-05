import { customAlphabet } from "nanoid";

// 8-char base62, URL-safe, globally unique (planning.md §4).
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const newToken = customAlphabet(alphabet, 8);

/** Build a deck link URL: https://<deck-domain>/?t=<token> */
export function buildLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/?t=${token}`;
}
