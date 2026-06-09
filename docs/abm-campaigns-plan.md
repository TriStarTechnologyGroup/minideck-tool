# Planning: ABM Campaigns for the Minideck Tool

> Add an account-based-marketing layer so the tool can run campaigns like the ASCO
> follow-up playbook: campaigns → accounts → one shared tracked deck link per account,
> with research, angle, a multi-contact thread, and a 3-touch cadence — all driven by
> the engagement tracking already built.

**Status:** Ready to build (Phase 1) · **Audience:** coding-agent LLM + reviewer
**Builds on:** the existing minideck-tool (decks, links, contacts, engagement collector, `/leads`, alerts, batched stats, bulk/CSV).

---

## 1. Context — the motion (from the ASCO Follow-Up Playbook)

The playbook runs **9 accounts / 14 contacts** under one campaign ("ASCO follow-up"),
all using the **AI deck** (`ai-cohorts.tristargroup.us`). The motion is **account-centric**:

- **One tracked deck link per account**, shared across that account's contacts + cc's on a
  **single email thread** (e.g. Lunit = `?t=z7uTqQhj`, sent to Ahn & Jung, cc Marie).
- Each account carries: **verified research** (dated), **ASCO context / warmth**, a tailored
  **angle & hooks**, a **contact set with roles** (to + cc), and a **3-touch cadence** —
  Touch 1 (Day 0, tailored), Touch 2 (Day +4, light), Touch 3 (Day +9, soft close) —
  **drafted for review**; sender is one person (Shaan); pricing never mentioned.

The current app is **contact → link** (one token per contact per deck). This adds the
**campaign / account / cadence / research / draft** layer on top — without changing the
tracking foundation.

---

## 2. Goals (Phase 1 MVP)

1. **Campaign** entity: a named ABM push tied to a deck, with a dashboard across accounts.
2. **Account** entity: company + warmth + research + ASCO context + angle, **one account-level
   tracked link**, a **contact set (to/cc, primary)**, and the **3 touch drafts**.
3. **Account-level engagement**: reuse the existing token tracking; surface opened?/depth/CTA/
   engaged-time/last-activity **per account** (any of its people opening the shared link counts).
4. **Cadence tracking (manual)**: mark each touch sent (date); compute "next due / overdue"
   from day-offsets; copy each draft in one click. (No sending from the app in Phase 1.)
5. **Campaign dashboard**: accounts ranked by warmth/engagement with link, cadence stage, and
   next action — a campaign-scoped, cadence-aware view (sibling to `/leads`).
6. **Seed the ASCO campaign** from the playbook (9 accounts, contacts, research, angle, drafts,
   and the **existing deck tokens**) so it's usable immediately and activates tracking for those
   links.

---

## 3. Non-Goals (Phase 1)

- No sending/automation of emails (drafts are stored + copied; you send from email/HubSpot).
  → Phase 2: mailto / HubSpot sequences.
- No cadence auto-reminders/notifications yet → Phase 2 (reuse the alert infra).
- No engagement-driven auto-rewrite of touches → Phase 2 (surface hints only).
- No HubSpot **company** object association → Phase 2 (Phase 1 uses existing contacts).
- No new tracking mechanics — account links are ordinary `links` rows, so `track.js`,
  `/api/ingest`, stats, and alerts work unchanged.

---

## 4. Locked decisions

| Area | Decision |
|---|---|
| Link model | **Account-level**: one token per account, shared across its contacts; engagement reads at the account. |
| Emails | **Store + copy the 3 drafts**, track cadence status (sent dates) manually. Sending stays in email/HubSpot. |
| Seed | **Yes** — preload the ASCO campaign from the playbook, reusing the existing tokens. |
| Foundation | Reuse `links`/`link_engagement`/`contacts`/`decks` + `createOrReuseLink`, batched stats, `/leads` scoring, milestone alerts. |

---

## 5. Account-level link semantics (the key design point)

An **account link is an ordinary `links` row** so all existing infrastructure keeps working:
- `links` gets a nullable **`account_id`** FK. The row's `contact_id` = the account's **primary
  contact** (e.g. Lunit → Dr. Ahn), `deck_id` = the campaign's deck, `token` = the account token.
- `track.js` / `/api/ingest` / `link_engagement` / `/api/links/[token]/stats` / batched
  `/api/decks/[id]/stats` / milestone alerts → **unchanged**; they operate on the token/link row.
- **Account engagement = that link's engagement.** The cc/other contacts are stored in
  `account_contacts` for the thread + drafts, but they do **not** get separate links (one shared
  link is the whole point).
- Milestone alerts already route to the **link creator** (the rep) — correct for ABM.

> Consequence: seeding the existing tokens (`z7uTqQhj`, …) as `links` rows **activates tracking**
> for them — until a `links` row exists, `/api/ingest` drops beacons for that token.

---

## 6. Data model (new tables + one alteration)

```sql
-- 0008_abm.sql
create table if not exists public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  deck_id      uuid not null references public.decks(id) on delete restrict,
  sender_label text,                         -- e.g. "Shaan Bhagat" (who sends)
  status       text not null default 'active' check (status in ('active','archived')),
  -- cadence template: [{seq, label, day_offset}], e.g. Touch 1/2/3 @ 0/4/9
  cadence      jsonb not null default '[{"seq":1,"label":"Touch 1","day_offset":0},{"seq":2,"label":"Touch 2","day_offset":4},{"seq":3,"label":"Touch 3","day_offset":9}]',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  name         text not null,               -- company, e.g. "Lunit"
  warmth       text not null default 'warm' check (warmth in ('hot','warm','light')),
  research     text,                         -- verified web research (dated)
  context      text,                         -- ASCO context / relationship
  angle        text,                         -- angle & hooks
  link_id      uuid references public.links(id) on delete set null, -- the shared account link
  started_at   timestamptz,                  -- cadence anchor (Touch 1 send date); null until started
  status       text not null default 'active' check (status in ('active','won','closed','archived')),
  created_at   timestamptz not null default now(),
  unique (campaign_id, name)
);

create table if not exists public.account_contacts (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  role         text not null default 'to' check (role in ('to','cc')),
  is_primary   boolean not null default false,
  unique (account_id, contact_id)
);

create table if not exists public.touches (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  seq          int not null,                 -- 1,2,3
  day_offset   int not null,                 -- 0,4,9
  subject      text,
  body         text,
  status       text not null default 'draft' check (status in ('draft','sent','skipped')),
  sent_at      timestamptz,
  unique (account_id, seq)
);

alter table public.links add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists links_account_id_idx on public.links(account_id);

-- RLS: same posture as existing tables — authenticated SELECT-all; writes via service role.
alter table public.campaigns enable row level security;
alter table public.accounts enable row level security;
alter table public.account_contacts enable row level security;
alter table public.touches enable row level security;
-- (add select-to-authenticated policies mirroring decks/contacts/links)
```

---

## 7. API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/campaigns` | GET/POST | List / create campaign (name, deck, cadence template). |
| `/api/campaigns/[id]` | PATCH/DELETE | Edit / archive / delete (cascade accounts). |
| `/api/campaigns/[id]/stats` | GET | Batched engagement for all account links in the campaign (reuse `getMergedStatsForTokens`). |
| `/api/accounts` | POST | Create account: upsert primary + cc contacts, create the **account link** via `createOrReuseLink` (suppress HubSpot note when seeding/importing), persist research/angle/context, generate the 3 touches from the campaign cadence. |
| `/api/accounts/[id]` | PATCH/DELETE | Edit account fields / warmth / status. |
| `/api/touches/[id]` | PATCH | Update a draft (subject/body) or mark **sent** (sets `sent_at`; if seq 1, set `accounts.started_at`). |

All admin/user-gated consistent with existing routes (`requireApiUser`); deletes admin-only.

---

## 8. UI / pages

- **`/campaigns`** — list of campaigns (name, deck, # accounts, # engaged, status). Nav entry.
- **`/campaigns/[id]`** — **dashboard**: table of accounts × { warmth chip · primary contact ·
  link + Copy · opened?/depth/CTA/last-activity (batched stats) · cadence stage (e.g. "Touch 2 due
  in 1d" / "overdue" / "complete") · next action }. Sort by warmth × engagement (reuse `/leads`
  scoring). "Add account" + "Export CSV".
- **`/campaigns/[id]/accounts/[accountId]`** — **account page**:
  - Header: company, warmth, status, the **account link** + Copy.
  - **Research / ASCO context / Angle** (editable).
  - **Contacts**: to/cc with roles (primary flagged); HubSpot links.
  - **Cadence**: the 3 touches — subject + body (copy button each), **Mark sent** (date), and
    computed due dates from `started_at` + `day_offset`.
  - **Engagement**: this account's link stats + per-slide detail (reuse the link detail view).
- Reuse components: `CopyButton`, link stats cells, warmth/signal chips, CSV export.

---

## 9. Cadence model (Phase 1, manual)

- Campaign holds a **cadence template** (`[{seq,label,day_offset}]`), default Touch 1/2/3 @ 0/4/9.
- Each account gets 3 `touches` rows on creation (offsets from the template, drafts seeded).
- **Anchor:** `accounts.started_at` is set when **Touch 1 is marked sent**. Due date for touch N =
  `started_at + day_offset`. Before start, show "not started".
- Dashboard computes per account: current stage, **next-due touch + date**, overdue flag.
- **Engagement-aware (Phase 1 = hints only):** if the account's link was opened / reached CTA,
  show a "🔥 engaged — consider a warmer follow-up" hint next to the next touch. (Auto-rewrite =
  Phase 2.)

---

## 10. Seeding the ASCO campaign

A script `scripts/seed-asco-campaign.mjs` (run with `node --env-file=.env.local`) creates one
campaign + the 9 accounts, reusing the **existing tokens** so tracking activates. It upserts the
14 contacts (DB + HubSpot, **without** firing "link created" notes — these were already sent),
creates each account link as a `links` row with the exact token, and loads the 3 touch drafts
verbatim from the playbook.

| Account | Token | Primary → cc | Warmth |
|---|---|---|---|
| Lunit | `z7uTqQhj` | Ahn, Jung → cc Marie | hot (met at ASCO) |
| Imagene AI | `8kEoOfhW` | Daniel → cc Brian, Dean | warm |
| Exai | `MAieBRSC` | Michael Nall (CEO) | warm |
| Nucleai | `BrfifO4s` | Sharon Elkobi | warm |
| BostonGene | `QgFEEag6` | Tamara Laskowski | warm |
| ConcertAI | `TMigZwKo` | Bob Zambon → cc Caitlin, Simran | warm |
| Artera | `8hMsrilO` | Nate Wade | warm |
| 1Cell.AI | `fmpyC5W2` | Ajay Pandita | light (intro) |
| Advanced Clinical | `krdV6Fua` | Elizabeth Dugan | warm (referral) |

Deck for all = `ai-cohorts`. Sender = Shaan Bhagat. Research / angle / context / the 3 touch
subjects + bodies are copied per-account from the playbook (the script embeds them).

---

## 11. Build order (Phase 1)

1. Migration `0008_abm.sql` + RLS; apply via `scripts/apply-migrations.mjs`.
2. Lib types + `getMergedStatsForTokens` reuse for campaign stats; account-create service
   (wraps `createOrReuseLink` with `account_id` + contacts + touches).
3. API routes (campaigns, accounts, touches, campaign stats).
4. `/campaigns` list + `/campaigns/[id]` dashboard.
5. `/campaigns/[id]/accounts/[id]` account page (research/angle/contacts/cadence/engagement).
6. Seed script + run for ASCO.
7. Nav entry; tests (account-create reuse + cadence due-date math + RBAC); CI; deploy.

---

## 12. Acceptance criteria

- [ ] Create a campaign tied to the AI deck with the default 3-touch cadence.
- [ ] Add an account → upserts to/cc contacts, creates one shared account link, seeds 3 drafts.
- [ ] Account link is a normal trackable link: opening `ai-cohorts/?t=<token>` records engagement
      and surfaces on the account + campaign dashboard.
- [ ] Mark Touch 1 sent → anchors cadence; dashboard shows Touch 2 due at +4d, Touch 3 at +9d.
- [ ] Copy any draft / the account link in one click.
- [ ] Campaign dashboard ranks accounts by warmth × engagement and shows cadence stage.
- [ ] Seeded ASCO campaign shows all 9 accounts with their existing tokens, and engagement begins
      recording for those tokens.
- [ ] Non-admins can use campaigns; deletes are admin-only.

---

## 13. Phase 2 (later)

- Cadence **reminders** ("Touch 2 due for Lunit today") via the existing alert infra.
- **Engagement-driven next-best-action** (opened 2× → warmer Touch 2; silent → soft close).
- **Email send**: mailto with to/cc/subject/body + link prefilled, or HubSpot sequence push.
- **HubSpot company** association + account-level timeline rollup.
- Account **CSV import** (reuse `csv.ts`) and campaign templates.

---

## 14. Open questions

1. **Warmth scale** — hot/warm/light (proposed) vs a numeric priority?
2. **Cadence anchor** — Touch 1 sent date (proposed) vs campaign launch date vs per-account manual.
3. **cc engagement** — confirmed: one shared link, cc's don't get separate tokens (account-level).
4. **Seed & HubSpot** — when seeding already-sent accounts, suppress "link created" notes (proposed)
   so we don't double-log; confirm.
5. **Deletion semantics** — deleting an account: also delete its link + engagement (cascade) or keep
   the link orphaned? (Proposed: cascade, mirroring deck/link deletion.)
