# Deployment Runbook — Minideck Link & Tracking Tool

Turns the locally-complete app into a live system and switches on per-link tracking.
Three phases, **in order** (the ordering matters — see ⚠️ in Phase 3):

1. **Deploy the app** (`minideck-tool` → Vercel) and point `decks.tristargroup.us` at it.
2. **Confirm Plausible** config (custom props/goals) so events register.
3. **Deploy the deck repos** (Netlify) — only *after* `track.js` is live.

Then verify end-to-end. Most steps are actions only you can do (Vercel/Netlify/DNS
accounts); each is spelled out. Values come from `minideck-tool/.env.local`.

---

## Phase 0 — One-time prep

- [ ] **Change the admin password.** Log in once locally (`admin@tristargroup.us`, temp
      password from setup) and reset it, or do it in Supabase → Authentication → Users.
- [ ] **Make `minideck-tool` a git repo** (it was scaffolded without one):
      ```bash
      cd minideck-tool
      git init && git add -A && git commit -m "Minideck tool: M1–M8"
      ```
      Push to a new private GitHub repo (recommended for ongoing deploys):
      ```bash
      gh repo create <your-org>/minideck-tool --private --source=. --push
      ```
      (`.env.local` is git-ignored — secrets won't be committed. Good.)

---

## Phase 1 — Deploy the app to Vercel

### 1a. Import the project
- **GitHub path (recommended):** Vercel → **Add New → Project** → import the
  `minideck-tool` repo. Framework auto-detects **Next.js**. Root directory = repo root.
- **CLI path (fastest):** `npm i -g vercel && cd minideck-tool && vercel` (link/create a
  project), then `vercel --prod` after env vars are set.

### 1b. Set environment variables (Vercel → Project → Settings → Environment Variables)
Copy the values from `minideck-tool/.env.local`. Set for **Production** (and Preview if you
want previews to work):

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from .env.local | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from .env.local | publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | from .env.local | **secret** |
| `HUBSPOT_TOKEN` | from .env.local | **secret** |
| `HUBSPOT_PORTAL_ID` | `4194516` | |
| `PLAUSIBLE_API_KEY` | from .env.local | **secret** |
| `APP_BASE_URL` | `https://decks.tristargroup.us` | **change from localhost** |
| `SCREENSHOT_API_KEY` | *(leave empty)* | Microlink free tier |

> **Do NOT** add `SUPABASE_ACCESS_TOKEN` — it's only for local migration scripts, never the
> running app. Keep it out of Vercel.

### 1c. Deploy
- [ ] Trigger the deploy. Confirm the build succeeds (it builds clean locally).
- [ ] Open the temporary `*.vercel.app` URL → `/login` should load; logging in lands on
      `/decks` with your two decks + thumbnails.

### 1d. Custom domain + DNS
- [ ] Vercel → Project → **Settings → Domains → Add** `decks.tristargroup.us`.
- [ ] In TriStar DNS, add the record Vercel shows — typically a **CNAME**:
      `decks` → `cname.vercel-dns.com` (Vercel will display the exact target).
- [ ] Wait for verification + automatic TLS (usually minutes).
- [ ] Confirm **`https://decks.tristargroup.us/track.js`** returns the script (200) —
      this is the URL the deck repos reference.

### 1e. Supabase production URL
- [ ] Supabase → **Authentication → URL Configuration** → set **Site URL** to
      `https://decks.tristargroup.us`. (Password login doesn't redirect, but keep this
      correct for any future email flows.)

> **Vercel function note:** the screenshot route calls Microlink + uploads to Storage; it
> should finish well under the default timeout. If you ever see deck-screenshot timeouts on
> Hobby, add `export const maxDuration = 30;` to `src/app/api/screenshot/route.ts`.

---

## Phase 2 — Confirm Plausible config

Already verified the API key works. Make sure events will register (per site:
`hbs.tristargroup.us`, `ai-cohorts.tristargroup.us`):

- [ ] **Custom properties** allowed: `token`, `deck`, `slide`, `slide_index`, `section`
      (Site Settings → Custom Properties).
- [ ] *(Recommended)* **Goals**: custom events `Slide Reached`, `Slide View`,
      `Section View` (Site Settings → Goals).

---

## Phase 3 — Deploy the deck repos (Netlify)

⚠️ **Order matters.** The deck base script is now in **manual mode**, so the pageview only
fires from `track.js`. Deploy the decks **only after** `https://decks.tristargroup.us/track.js`
is confirmed live (Phase 1d). Deploying earlier = no pageviews fire at all.

The tracking edits are already applied to the local `sales-carousel/` and
`sales-carousel-ai/` folders (both `index.html` + `data/index.html`). **Note:** these local
folders are **not git repos** — pick the path that matches how the decks actually deploy:

- **If the canonical repos live elsewhere (GitHub → Netlify):** apply the same edits there.
  Each repo needs, on `index.html` *and* `data/index.html`:
  1. base script → `https://plausible.io/js/script.manual.pageview-props.tagged-events.js`
     (remove the old `script.tagged-events.js`);
  2. add `<script defer data-deck="hbs|ai-cohorts" src="https://decks.tristargroup.us/track.js"></script>`;
  3. migrate the inline block: `?lead=`→`?t=`, `tristar_lead`→`tristar_t`,
     `TRISTAR_LEAD`→`TRISTAR_TOKEN`, `props.lead`→`props.token`.
  Easiest: copy the four edited files from here into the real repo, commit, push.
  *(See `minideck-tracking-spec.md` for the exact before/after.)*

- **If you deploy by hand:** drag-and-drop each edited folder into its Netlify site
  (Deploys → drag the folder), or `netlify deploy --prod --dir=sales-carousel` with the
  Netlify CLI linked to each site.

- [ ] Review the changes (base script swapped to manual + tracker tag + `?t=` migration).
- [ ] Deploy both deck sites.
- [ ] Confirm each site is live and `track.js` loads (Network tab).

---

## Phase 4 — End-to-end verification

- [ ] In the app, open a deck → generate a link for a test contact → it auto-copies.
- [ ] Confirm the contact + a timeline note appear in **HubSpot** (row deep-links to it).
- [ ] Open the generated `https://hbs.tristargroup.us/?t=<token>` in a browser:
  - [ ] DevTools → Network: exactly **one** Plausible pageview; **no** second base-script
        pageview (confirms the old tag was removed).
  - [ ] Advance through slides → `Slide Reached` / `Slide View` events fire (tagged with
        `token`).
  - [ ] Click the artifact (`data/`) link → new tab, token recovered from `localStorage`,
        a `Section View` (`section=artifact`) fires.
- [ ] Open a deck URL **without** `?t=` → normal pageview, **no** token-tagged events.
- [ ] Back in the app → deck detail → **Refresh stats** → the link's row shows Opened=Yes,
      visits, slide depth, etc. (Plausible has ~minutes of lag + the app caches ~60s.)
- [ ] Repeat the open-test for `ai-cohorts.tristargroup.us`.

---

## Rollback / safety

- **App**: Vercel keeps every deploy — instant rollback via Vercel → Deployments → Promote.
- **Decks**: if tracking misbehaves, revert the deck commit (Netlify redeploys the prior
  build). The tracking edits are additive and don't touch visitor-facing content.
- **Secrets**: rotate in the source service and update Vercel env if ever exposed. Never
  commit `.env.local`.

---

## Reference: helper scripts (run locally with `--env-file=.env.local`)

| Script | Purpose |
|---|---|
| `scripts/check-supabase.mjs` | Supabase URL/keys + bucket |
| `scripts/check-hubspot.mjs` | HubSpot token + contacts read |
| `scripts/check-plausible.mjs` | Plausible Stats API + sites |
| `scripts/apply-migrations.mjs` | Apply SQL migrations (needs `SUPABASE_ACCESS_TOKEN`) |
| `scripts/seed-admin.mjs <email>` | Create/promote an admin |
| `scripts/seed-decks.mjs` | Upsert the two decks + thumbnails |
