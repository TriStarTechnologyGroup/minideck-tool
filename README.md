# Minideck Link & Tracking Tool

Internal TriStar sales tool: generate trackable per-prospect links to the branded
"minideck" sites, tie each to a HubSpot contact, and surface per-link engagement from
Plausible. Next.js (App Router) + Supabase + HubSpot + Plausible, deployed on Vercel at
**`decks.tristargroup.us`**.

Specs live one level up: [`../planning.md`](../planning.md) (the app),
[`../minideck-tracking-spec.md`](../minideck-tracking-spec.md) (deck-repo changes),
[`../SETUP.md`](../SETUP.md) (provisioning runbook).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in as you provision (see ../SETUP.md)
npm run dev                  # http://localhost:3000
```

The landing page shows per-integration readiness. Blank env vars are fine for the
scaffold — each integration reports "Not configured" until its keys are set.

## Layout

```
src/
  app/
    layout.tsx          root layout + metadata
    page.tsx            landing / integration health
  lib/
    env.public.ts       client-safe env (NEXT_PUBLIC_*)
    env.server.ts       server-only env (secrets) + integrationStatus
    supabase/
      client.ts         browser client (anon, RLS)
      server.ts         server client (anon, RLS, request cookies)  <- Next 16: await cookies()
      admin.ts          service-role client (bypasses RLS, server-only)
public/
  track.js              embeddable tracker for the deck repos (served at /track.js)
```

## track.js

Carousel-aware Plausible tracker pasted into the deck repos. Pairs with Plausible's
**manual** base script. Resolves the opaque `?t=<token>`, fires one token-tagged
pageview, and emits per-slide (`Slide Reached` / `Slide View`) and artifact-page
(`Section View`) events. Slide slug taxonomy is centralized in this file, keyed by deck.
See `../minideck-tracking-spec.md`.

## Build order

Following [`../planning.md` §13](../planning.md). **Done:** Milestone 1 (scaffold + env +
Supabase clients + track.js). **Next:** Auth & roles -> Schema & RLS -> Decks ->
Contacts + links -> HubSpot -> wire track.js into the decks -> Plausible stats.

## Deploy (Vercel)

Import the repo, set the env vars from `.env.example`, add the `decks.tristargroup.us`
domain, and point DNS (CNAME -> Vercel). `APP_BASE_URL` should be the production URL.
