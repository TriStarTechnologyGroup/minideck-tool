# Planning: Minideck Link & Tracking Tool (MVP)

> Internal sales tool for TriStar Technology Group to generate trackable, per-prospect
> links to existing branded "minideck" websites, associate each link with a HubSpot
> contact, and surface per-link engagement analytics from Plausible.

**Status:** Ready to build · **Audience:** coding-agent LLM + reviewing engineer
**Owner:** Shaan Bhagat · **Date:** 2026-06-04

---

## 1. Context & Problem

TriStar runs outbound and digital marketing campaigns supported by branded "minideck"
websites — small pitch microsites that include deck content plus a pitch-specific
**artifact page**. Two exist today, each its own repo, deployed on **Netlify**:

| Deck name (working) | Repo | Live domain |
|---|---|---|
| AI Cohorts | `sales-carousel-ai` | `ai-cohorts.tristargroup.us` |
| HBS | `sales-carousel` | `hbs.tristargroup.us` |

Today there is no way to (a) generate a unique trackable link per prospect, (b) tie
that link to a HubSpot contact, or (c) see who engaged with which deck. This tool
closes that gap with the fastest possible "create contact → get trackable link on my
clipboard" workflow, plus per-link analytics sourced from Plausible.

**This is a validation MVP** — it must be deployable immediately and kept simple.

---

## 2. Goals (MVP)

1. **Pick a deck**, then see a table of all links generated for it (contact, company,
   link, key engagement stats, links to HubSpot records).
2. **Create a contact** (First Name, Last Name, Position, Company, Email) and generate a
   trackable link in as few clicks as possible — ideally one click after the form.
3. **Upsert the contact into HubSpot** (match by email) and log the generated link as a
   note on the contact timeline.
4. **One-click copy** of any generated link to the clipboard (short-URL-style UX).
5. **Per-link analytics** pulled from Plausible: opened?, visit count, last seen,
   time-on-page, bounce, slide depth (furthest reached), per-slide time, and
   artifact-page engagement.
6. **Admin deck management**: add a deck (Name, URL, auto-captured thumbnail), edit,
   archive/unarchive, delete.
7. **Auth with two roles**: `user` (create contacts + generate/copy links, view stats)
   and `admin` (everything + deck CRUD).
8. Ship an **embeddable tracking `<script>`** to drop into the two minideck repos that
   makes per-link Plausible segmentation possible.

---

## 3. Non-Goals (explicitly out of scope for MVP)

- No personalization of deck **content** per prospect — links are **tracking-only**; the
  deck looks identical for everyone. (Design the link payload so personalization can be
  added later without rework.)
- No custom short-link domain / redirect service — the token is appended to the existing
  deck domain (`?lead=<token>`). No new DNS.
- No full session replay or mouse-move pixel heatmaps. (Slide-progression + per-slide +
  artifact-page custom events only — the decks are horizontal carousels, see
  `minideck-tracking-spec.md`.)
- No writing engagement data back to HubSpot — engagement lives in Plausible; HubSpot
  only gets the contact + a link note.
- No billing, no external/customer-facing accounts. Internal team only.

---

## 4. Decisions & Defaults (locked)

| Area | Decision |
|---|---|
| **Stack** | Next.js (App Router) — admin UI + serverless API routes. Deploy on **Vercel**. |
| **Database** | **Supabase Postgres** (also used for Auth + file storage for thumbnails). |
| **Auth** | Supabase Auth (email/password). Roles `admin`/`user` stored on a `profiles` table / JWT claim. |
| **Link format** | `https://<deck-domain>/?lead=<token>` — token appended to existing deck URL. |
| **Token** | URL-safe random ID, 8 chars, base62 (`nanoid`), globally unique. |
| **Analytics source** | **Plausible Stats API v2**. One API key; **separate Plausible site per deck** (deck row stores its `plausible_site_id`). |
| **HubSpot** | Private App token. **Upsert contact by email**, then create a **timeline note** per generated link. DB is source of truth for links. |
| **Thumbnails** | **Auto-screenshot** of the deck URL at add/edit time via **Microlink** (hosted API); store image in Supabase Storage. |
| **App domain** | **`decks.tristargroup.us`** — serves the admin UI and `/track.js`. |
| **Tracking script** | Single embeddable JS file served from the app; pasted into both minideck repos. |

---

## 5. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js app (Vercel)  —  decks.tristargroup.us               │
│                                                                │
│  /login                       Supabase Auth                    │
│  /decks                       grid of decks (thumbnails)       │
│  /decks/[id]                  link table + per-link stats      │
│  /decks/new  /decks/[id]/edit (admin) deck CRUD + screenshot   │
│                                                                │
│  /api/contacts                upsert contact + HubSpot + token │
│  /api/links                   list/create links                │
│  /api/links/[token]/stats     proxy → Plausible Stats API      │
│  /api/decks                   deck CRUD + trigger screenshot    │
│  /api/screenshot              capture deck thumbnail           │
│  /track.js                    embeddable tracking script       │
└───────────────┬───────────────────────────┬──────────────────┘
                │                           │
        ┌───────▼───────┐          ┌────────▼────────┐
        │ Supabase      │          │ HubSpot CRM API │
        │ Postgres+Auth │          │ (private app)   │
        │ + Storage     │          └─────────────────┘
        └───────────────┘
                ▲
                │ Stats API v2 (read)
        ┌───────┴────────┐
        │ Plausible.io   │  ← receives events from /track.js on the deck sites
        └────────────────┘
```

**Tracking data flow:** prospect opens `hbs.tristargroup.us/?lead=Ab3xK` → embedded
`/track.js` reads `t` from the URL → sends a Plausible pageview **tagged with custom
props** `{ token: "Ab3xK", deck: "hbs" }` plus per-slide custom events (`Slide Reached`,
`Slide View`) — and, if they open the artifact page, a token-tagged `data/?lead=Ab3xK`
pageview + `Section View` → app reads it back per-token via the Plausible Stats API and
renders it in the link table. (The decks are horizontal carousels, so engagement depth is
**furthest slide reached**, not scroll %; see `minideck-tracking-spec.md`.)

---

## 6. Data Model (Supabase Postgres)

```sql
-- profiles: extends Supabase auth.users with a role
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'user' check (role in ('user','admin')),
  created_at  timestamptz not null default now()
);

create table decks (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  base_url           text not null,              -- e.g. https://hbs.tristargroup.us
  slug               text not null unique,       -- e.g. "hbs" (used as Plausible prop + label)
  thumbnail_url      text,                        -- Supabase Storage public URL
  plausible_site_id  text not null,              -- the deck's Plausible site (domain)
  archived           boolean not null default false,
  created_by         uuid references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table contacts (
  id               uuid primary key default gen_random_uuid(),
  first_name       text not null,
  last_name        text not null,
  position         text,
  company          text,
  email            text not null,
  hubspot_id       text,                          -- contact id returned by HubSpot upsert
  hubspot_url      text,                          -- deep link to the record
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  unique (email)
);

create table links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,              -- 8-char nanoid
  deck_id      uuid not null references decks(id) on delete cascade,
  contact_id   uuid not null references contacts(id) on delete cascade,
  full_url     text not null,                     -- base_url + "/?lead=" + token
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  unique (deck_id, contact_id)                    -- one link per contact per deck (regenerate = reuse)
);
```

**Row Level Security:** enable RLS on all tables. All authenticated internal users may
`select` everything; `admin` role required for `decks` mutations. (MVP: a single team
shares visibility — do not scope links per creator.)

---

## 7. HubSpot Integration

- **Auth:** Private App access token in `HUBSPOT_TOKEN`. Required scopes:
  `crm.objects.contacts.read`, `crm.objects.contacts.write`, and notes/engagements
  write (`crm.objects.notes.write` or the legacy engagements scope).
- **Upsert by email:** Use the contacts API with email as the idempotency key
  (`POST /crm/v3/objects/contacts` with a search-then-update fallback, or the
  batch upsert endpoint with `idProperty=email`). Map: `firstname`, `lastname`,
  `jobtitle`, `company`, `email`.
- **Store back:** persist returned `hubspot_id` and construct `hubspot_url`
  (`https://app.hubspot.com/contacts/<portalId>/contact/<hubspot_id>`). Portal id in
  `HUBSPOT_PORTAL_ID`.
- **Timeline note per link:** create a Note engagement associated with the contact:
  > `Minideck link (<Deck Name>): <full_url> — created <date> by <user email>`
  This handles the multi-deck case (one contact, multiple deck links → multiple notes).
- **Failure handling:** if HubSpot fails, still create the contact + link locally,
  mark `hubspot_id = null`, and surface a non-blocking warning + a "retry sync" action.

---

## 8. Plausible Integration

### 8.1 Why a script is required
Plausible collapses query strings by default, so `?lead=Ab3xK` alone is **not** filterable.
The embedded script tags events with a **custom property** `token` (and `deck`), which
the Stats API can break down and filter by.

### 8.2 Stats API (read)
- Base: `https://plausible.io/api/v2/query` (Stats API v2). Auth: `Authorization: Bearer <PLAUSIBLE_API_KEY>`.
- The app holds **one** API key; each deck row supplies its own `plausible_site_id`.
- For a given link, query that deck's site filtered by the custom prop:
  `filters: [["is", "event:props:lead", ["<token>"]]]`.
- **Metrics to surface per link** (all selected for MVP):
  - **Opened? + visit count + last seen** — `visitors`, `visits`/`pageviews`, plus a
    time-bucketed query for last activity.
  - **Time on page + bounce** — `visit_duration`, `bounce_rate`.
  - **Slide depth (furthest reached)** — from `Slide Reached` custom events; the max
    `slide_index` seen per token. (Replaces scroll depth — decks are carousels.)
  - **Per-slide time** — from `Slide View` custom events with a `slide` prop; break down
    by `event:props:slide` filtered to the token.
  - **Artifact-page engagement** — from `Section View` (`section = artifact`) events on
    the `data/` page, filtered to the token.
- **Caching:** cache Stats API responses ~60s per token to avoid rate limits; show a
  "last refreshed" timestamp with a manual refresh button.

### 8.3 Setup steps (provisioned by Shaan; document in README)
1. Confirm each deck domain is a Plausible site; record each `site_id`.
2. Enable **custom properties** for `token`, `deck`, `slide`, `slide_index`, `section`.
3. Create custom-event goals: `Slide Reached`, `Slide View`, `Section View` (optional but
   improves UI).
4. Generate a Stats API key → `PLAUSIBLE_API_KEY`.

---

## 9. Embeddable Tracking Script (`/track.js`)

A single file served by the app and added to **both** minideck repos (before `</body>`)
on the deck page **and** the `data/` artifact page. The decks already load a Plausible
base tag, so the integration **replaces** it with the manual variant rather than adding a
second one (see `minideck-tracking-spec.md` §2). Requirements:

```html
<!-- Plausible base (manual mode so we can attach props) -->
<script defer data-domain="hbs.tristargroup.us"
        src="https://plausible.io/js/script.manual.pageview-props.tagged-events.js"></script>
<!-- TriStar minideck tracker -->
<script defer data-deck="hbs" src="https://decks.tristargroup.us/track.js"></script>
```

`track.js` behavior:
1. Read `t` from the query string → `token`. If absent, fire a normal pageview and stop
   (organic/untracked visit).
2. Read `deck` from the script's `data-deck` attribute.
3. Fire the Plausible **pageview tagged with props** `{ token, deck }` (reusing the page's
   existing `window.plausible`) so native metrics (visit duration, bounce, visits) are
   filterable by token.
4. **Furthest slide reached (carousel depth):** observe `article.slide` via
   `IntersectionObserver`; the first time each slide becomes active, emit `Slide Reached`
   with props `{ token, deck, slide, slide_index }`. Max `slide_index` per visit = depth.
   *(Replaces scroll-depth milestones — the decks are horizontal carousels, not scroll
   pages.)*
5. **Per-slide time:** time how long each `article.slide` is the active/visible slide; on
   slide change / `pagehide` / `visibilitychange`, emit `Slide View` with props
   `{ token, deck, slide, slide_index, seconds }` (rounded). Slug from `data-slide`, else
   index + `slide__title`.
6. **Artifact page (`data/`):** same token-tagged pageview; time total dwell and emit a
   `Section View` with `{ token, deck, section: "artifact", seconds }` on exit. The deck
   page must propagate `?lead=` onto the `data/` link (it opens in a new tab).
7. Be dependency-free, < ~3KB, and safe to load twice.

> **Coordinate with deck repos:** the minideck pages should add `data-slide="..."`
> attributes to each `article.slide` (the tracker falls back to index + `slide__title` if
> absent) and propagate the token to the `data/` link. See the agreed slug taxonomy in
> `minideck-tracking-spec.md` §4.

**Privacy:** no PII in events — only the opaque token. Token→person mapping lives only in
our DB/HubSpot. Note this in an internal privacy blurb.

---

## 10. Pages & UI

### `/login`
Supabase email/password. Redirect to `/decks` on success.

### `/decks` (all authenticated users)
- Responsive grid of deck cards: thumbnail, name, link count, archived badge.
- Archived decks shown in a collapsed/hidden section (toggle).
- Admins see an **Add Deck** button.

### `/decks/[id]` (all authenticated users)
- Header: deck name, thumbnail, base URL.
- **Primary action: "New Link"** → contact form (inline) with a **HubSpot typeahead**:
  type a name/email → debounced search of HubSpot contacts → pick a match to **autofill**
  First/Last/Position/Company/Email (and link to the existing record), **or** fill the
  fields manually to create a new contact. On submit: upsert contact (DB) → HubSpot upsert
  + note → create link → **auto-copy link to clipboard** → toast. This is the core fast path.
- **Link table** columns:
  - Contact (first + last) → links to HubSpot record (`hubspot_url`)
  - Company
  - Link (truncated) + **Copy** button (one click)
  - Opened? · Visits · Last seen
  - Time on page · Bounce
  - Slide depth (furthest slide reached, e.g. 5/8)
  - Artifact page opened? (+ seconds, from the `data/` page)
  - Per-slide detail (expandable row → bars of seconds per slide)
  - Created date
- "Refresh stats" button (re-query Plausible, respect cache).
- If a contact already has a link for this deck, "New Link" with the same email reuses
  the existing token (no duplicate) and re-copies it.

### `/decks/new` and `/decks/[id]/edit` (admin only)
- Fields: Name, Base URL, Slug, Plausible Site ID, Archived toggle.
- On save: trigger **auto-screenshot** of the Base URL → store thumbnail in Supabase
  Storage → save URL. Show capture status + allow re-capture.
- Delete (with confirm) and Archive/Unarchive actions.

### Global
- Top nav: deck switcher, current user, sign out. Admin sees nothing user-hidden beyond
  deck CRUD affordances.

---

## 11. API Routes (Next.js, server-side; service-role for DB writes)

| Route | Method | Role | Purpose |
|---|---|---|---|
| `/api/contacts` | POST | user | Upsert contact (by email) + HubSpot upsert + note + create link; returns `{ link }`. |
| `/api/links?deckId=` | GET | user | List links for a deck (joins contact). |
| `/api/links/[token]/stats` | GET | user | Proxy to Plausible Stats API for this token; cached. |
| `/api/decks` | GET | user | List decks. |
| `/api/decks` | POST | admin | Create deck + screenshot. |
| `/api/decks/[id]` | PATCH | admin | Edit / archive / unarchive. |
| `/api/decks/[id]` | DELETE | admin | Delete deck (+ cascade links). |
| `/api/screenshot` | POST | admin | Capture thumbnail for a URL. |
| `/track.js` | GET | public | Serve the tracking script (cacheable). |

Validate all input with `zod`. Enforce role checks server-side (don't trust the client).

### Screenshot capture
**Locked: Microlink** (hosted API) via `SCREENSHOT_API_KEY` — simplest on Vercel; free
tier works to start. `/api/screenshot` calls Microlink for the deck `base_url`, downloads
the returned image, and stores the PNG/WebP in Supabase Storage; saves its public URL on
the deck. Keep the provider behind the `/api/screenshot` route so it can be swapped later
(e.g. to bundled `@sparticuz/chromium` + `puppeteer-core`) without touching callers.

---

## 12. Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# HubSpot
HUBSPOT_TOKEN=
HUBSPOT_PORTAL_ID=

# Plausible
PLAUSIBLE_API_KEY=
# (per-deck site_id lives in the decks table, not env)

# Screenshots (Microlink)
SCREENSHOT_API_KEY=

# App
APP_BASE_URL=https://decks.tristargroup.us
```

---

## 13. Build Order (milestones)

1. **Scaffold** — Next.js App Router + Tailwind, Supabase client (browser + server),
   env wiring, deploy a hello-world to Vercel.
2. **Auth & roles** — Supabase Auth, `profiles` table + trigger to default role, route
   guards, `/login`. Seed one admin.
3. **Schema & RLS** — migrations for all tables + policies + Storage bucket.
4. **Decks (admin)** — deck CRUD UI + `/api/decks` + screenshot capture + `/decks` grid.
5. **Contacts + links core fast path** — contact form, `/api/contacts` (DB only first),
   token generation, link table, **one-click copy + auto-copy on create**.
6. **HubSpot** — upsert by email + timeline note + store `hubspot_id`/`hubspot_url` +
   record-link in table; graceful failure + retry.
7. **Tracking script** — build/serve `/track.js`; integrate into both minideck repos;
   verify props land in Plausible.
8. **Plausible stats** — `/api/links/[token]/stats` + render all metrics + per-section
   expansion + caching + refresh.
9. **Polish** — archived deck handling, empty states, toasts, loading/error states,
   responsive pass.

Ship after milestone 6 is usable; 7–8 light up analytics.

---

## 14. Acceptance Criteria

- [ ] A user can log in; role gates deck CRUD correctly.
- [ ] Admin can add a deck and a thumbnail is auto-captured from its URL.
- [ ] From a deck page, creating a contact (5 fields) produces a link and **auto-copies
      it to the clipboard** in one submit.
- [ ] The contact is upserted in HubSpot (matched by email, no duplicate) and a timeline
      note with the link is created; the table row deep-links to the HubSpot record.
- [ ] Generating a link for the same email+deck reuses the existing token.
- [ ] Any link can be copied with one click.
- [ ] Opening `<deck>/?lead=<token>` produces, within Plausible, a single token-tagged
      pageview + per-slide (`Slide Reached` / `Slide View`) events; opening the artifact
      page carries the token and emits a `Section View` (`section = artifact`).
- [ ] The link table shows opened?/visits/last seen, time-on-page/bounce, slide depth
      (furthest reached), artifact-page engagement, and per-slide time for each token.
- [ ] Decks can be archived/unarchived/edited/deleted by an admin.

---

## 15. Security & Privacy

- All secrets server-side only; never expose `SUPABASE_SERVICE_ROLE_KEY`, `HUBSPOT_TOKEN`,
  or `PLAUSIBLE_API_KEY` to the browser.
- RLS on every table; role checks duplicated in API routes.
- Tracking events contain **no PII** — only opaque tokens. Token↔person mapping is
  internal. Add a short internal note that prospects are tracked via Plausible.
- Sanitize/validate `base_url` for decks (https only) before screenshotting/embedding.

---

## 16. Open Questions / Setup Prerequisites

> See **[SETUP.md](SETUP.md)** for the step-by-step provisioning guide. Status below.

1. **App domain** — ✅ **Locked: `decks.tristargroup.us`** (DNS → Vercel during deploy).
2. **Plausible** — decks already tracked. ⏳ Still needed: Stats API key, enable custom
   props (`token`, `deck`, `slide`, `slide_index`, `section`) + goals (`Slide Reached`,
   `Slide View`, `Section View`), record each deck's `site_id`. **Note:** the existing
   non-manual base script must be swapped for the manual variant (spec §2).
3. **HubSpot Private App** — account exists. ⏳ Still needed: create the Private App,
   capture token + portal id, confirm notes/engagements scope.
4. **Slide taxonomy** per deck — ⏳ Confirm. The decks are carousels; a proposed
   `data-slide` slug list for all 8 (HBS) + 17 (AI Cohorts) slides is in
   `minideck-tracking-spec.md` §4. Confirm/adjust with whoever maintains the
   `sales-carousel` / `sales-carousel-ai` repos, then record in each repo README.
5. **Screenshot provider** — ✅ **Locked: Microlink** (hosted) via `SCREENSHOT_API_KEY`.
6. **Supabase project** — ⏳ Needs creating (Postgres + Auth + Storage).
7. Initial **admin user(s)** — ⏳ Seed at least one admin after Supabase Auth is up.
```
