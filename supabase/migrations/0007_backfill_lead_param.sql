-- Standardize generated link URLs on the ?lead= query param.
--
-- The deck sites read `?lead=` (persisted to localStorage, attached to every
-- Plausible event as the `lead` prop). Earlier links were built with `?t=`,
-- which the decks silently ignore — so those stored URLs do not track.
--
-- This rewrites the stored full_url in place (the token is unchanged, so links
-- already copied/sent keep the same token). Idempotent: only rows containing
-- "/?t=" are touched, and re-running is a no-op.
update public.links
set full_url = replace(full_url, '/?t=', '/?lead=')
where full_url like '%/?t=%';
