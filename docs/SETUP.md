# Setup & Build Runbook — Minideck Link & Tracking Tool

> A single "do this, then that" sequence tying together the two specs:
> - `planning.md` — the app (Next.js + Supabase + HubSpot + Plausible)
> - `minideck-tracking-spec.md` — changes to the two deck repos
>
> Each step says **who** does it and **what unblocks**. You can start building before
> most credentials exist — they're only needed to *test* the milestone that uses them.

---

## Roles in this runbook
- **You (Shaan)** — provisions accounts, tokens, and decisions.
- **Builder** — the coding agent / engineer implementing the app.
- **Deck maintainer** — whoever owns `sales-carousel` / `sales-carousel-ai`
  (may be the same builder).

---

## Phase 0 — Decide before code starts (You)

- [x] **App domain** — ✅ locked: **`decks.tristargroup.us`** (serves the UI + `/track.js`).
      Until DNS is ready the builder uses the Vercel preview URL; don't paste `track.js`
      into the deck repos until this subdomain is live (the `src=` must be stable).
- [x] **Screenshot provider** — ✅ locked: **Microlink** (hosted). Free tier needs no key;
      `SCREENSHOT_API_KEY` only for Pro limits.
- [ ] **Confirm the `data-slide` slug taxonomy** for both decks (the decks are
      carousels — full proposed slug lists for all 8 HBS + 17 AI Cohorts slides are in
      `minideck-tracking-spec.md` §4). ⏳ **This is now the only remaining Phase-0
      blocker** and gates the deck-repo work.

Everything below can proceed in parallel with credential gathering.

---

## Phase 1 — Accounts & credentials (You, in parallel with Phase 2 build)

Gather these as you go; each maps to the milestone that needs it. None block scaffolding.

### Supabase (needed at Milestone 2)
- [ ] Create a Supabase project.
- [ ] Copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Create a Storage bucket for deck thumbnails (e.g. `thumbnails`, public read).

### HubSpot (needed at Milestone 6)
- [ ] Create a **Private App**; scopes: `crm.objects.contacts.read`,
      `crm.objects.contacts.write`, notes/engagements write
      (`crm.objects.notes.write`).
- [ ] Copy the token → `HUBSPOT_TOKEN`; note the portal id → `HUBSPOT_PORTAL_ID`.

### Plausible (needed at Milestone 8) — decks already tracked
- [ ] Confirm both deck domains are Plausible **sites**; record each `site_id`
      (= the domain).
- [ ] Enable custom properties: `token`, `deck`, `slide`, `slide_index`, `section`.
- [ ] (Recommended) Create custom-event goals: `Slide Reached`, `Slide View`,
      `Section View`.
- [ ] Generate a **Stats API key** → `PLAUSIBLE_API_KEY`.

### Screenshot provider — Microlink (needed at Milestone 4)
- [x] Free tier needs **no signup/key** — `/api/screenshot` calls the public endpoint.
- [ ] (Optional) Upgrade to Microlink Pro and set `SCREENSHOT_API_KEY` if you hit limits.

### App
- [ ] Decide initial **admin user email(s)** to seed.

---

## Phase 2 — Build the app (Builder)
Follows `planning.md` §13. Build with placeholder env vars; drop in real values from
Phase 1 as each milestone needs them.

1. [ ] **Scaffold** — Next.js (App Router) + Tailwind + Supabase client; deploy
       hello-world to Vercel. *(no creds)*
2. [ ] **Auth & roles** — Supabase Auth, `profiles` + default-role trigger, route
       guards, `/login`; seed an admin. *(needs Supabase)*
3. [ ] **Schema & RLS** — migrations for `decks/contacts/links/profiles` + policies +
       Storage bucket. *(needs Supabase)*
4. [ ] **Decks (admin)** — deck CRUD + `/decks` grid + auto-screenshot. *(needs
       screenshot provider)*
5. [ ] **Contacts + links fast path** — contact form, token gen, link table,
       one-click + auto-copy. *(no external creds — DB only)*
6. [ ] **HubSpot** — upsert by email + timeline note + store `hubspot_id`/`hubspot_url`
       + graceful failure/retry. *(needs HubSpot)*
7. [ ] **Tracking script** — build/serve `/track.js`. *(no creds; verified in Phase 3)*
8. [ ] **Plausible stats** — `/api/links/[token]/stats` + render all metrics +
       per-section expansion + caching. *(needs Plausible)*
9. [ ] **Polish** — archived decks, empty/loading/error states, responsive pass.

> **Usable checkpoint:** after Milestone 6 the core workflow (create contact → HubSpot →
> copy link) works. Milestones 7–8 light up analytics.

---

## Phase 3 — Wire up the deck repos (Deck maintainer)
Follows `minideck-tracking-spec.md`. Do after Milestone 7 (so `/track.js` is live) and
after the `data-slide` taxonomy is final.

1. [ ] **Replace** the existing Plausible base tag with the manual variant + add the
       tracker tag on **both** the deck page and the `data/` page in each repo (correct
       `data-domain` + `data-deck`). Don't add a second base tag (spec §2).
2. [ ] Add `data-slide="..."` to each `article.slide` per the agreed taxonomy (spec §4),
       and add the token-propagation snippet so the `data/` link carries `?lead=` (spec §3).
3. [ ] Deploy both Netlify sites.
4. [ ] **Verify** (spec §6): open `…/?lead=TEST1234` → confirm Plausible shows **one**
       token-tagged pageview + per-slide events, the artifact page carries the token, a
       no-token visit stays a plain pageview, and visitor-facing content is unchanged.
       Repeat for the second deck.

---

## Phase 4 — End-to-end acceptance (You + Builder)
Runs `planning.md` §14 against the live stack.

- [ ] Log in; role gating works (user vs admin deck CRUD).
- [ ] Admin adds a deck; thumbnail auto-captured.
- [ ] Create a contact (5 fields) → link auto-copied to clipboard in one submit.
- [ ] Contact upserted in HubSpot (no duplicate on repeat email) + timeline note; table
      row deep-links to the HubSpot record.
- [ ] Same email + same deck reuses the existing token.
- [ ] Opening `<deck>/?lead=<token>` surfaces opened?/visits/last-seen, time-on-page/bounce,
      slide depth (furthest reached), artifact-page engagement, and per-slide time in the
      link table.
- [ ] Archive / unarchive / edit / delete a deck (admin).

---

## Quick reference: env vars
```
NEXT_PUBLIC_SUPABASE_URL=          # Phase 1 · Milestone 2
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Phase 1 · Milestone 2
SUPABASE_SERVICE_ROLE_KEY=         # Phase 1 · Milestone 2
HUBSPOT_TOKEN=                     # Phase 1 · Milestone 6
HUBSPOT_PORTAL_ID=                 # Phase 1 · Milestone 6
PLAUSIBLE_API_KEY=                 # Phase 1 · Milestone 8
SCREENSHOT_API_KEY=                # Phase 1 · Milestone 4 (optional — Microlink Pro only)
APP_BASE_URL=https://decks.tristargroup.us
```

## Critical path (shortest route to a usable tool)
Phase 0 decisions → Supabase → Milestones 1–3 → Milestone 5 (links work, DB only) →
HubSpot creds → Milestone 6 (**usable**) → Plausible creds + Milestones 7–8 (analytics)
→ Phase 3 deck wiring → Phase 4 acceptance.
```
