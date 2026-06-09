# Minideck Repo Change Spec: Tracking Integration

> Companion to `planning.md`. Changes required in the two existing minideck repos
> (`sales-carousel` → `hbs.tristargroup.us`, `sales-carousel-ai` →
> `ai-cohorts.tristargroup.us`) so per-prospect links can be tracked and analyzed in
> Plausible, and surfaced per-link in the Minideck Link Tool.
>
> **Revised 2026-06-04** after auditing the actual repos. Key reality checks baked in:
> - The decks are **horizontal carousels** (HBS = 14 slides, AI Cohorts = 17 slides),
>   **not** vertical-scroll pages → engagement depth = **furthest slide reached**, not
>   scroll %.
> - Plausible is **already wired** (`window.trackEvent`, `[data-event]` click delegation)
>   but with the **non-manual** base script → the base tag must be **replaced**, not added.
> - The "artifact page" is the existing **`/data/`** subpage, which opens in a **new tab**
>   → the token must be **propagated** to it.

**Audience:** coding-agent LLM / whoever maintains the deck repos.
**Scope:** purely additive to what *visitors see* — **no visible content/layout change**.
Tracking-only.

> **✅ Status (2026-06-04): these edits have been APPLIED** to the local working copies of
> both repos (`index.html` + `data/index.html` in each). The decks already shipped a
> `?lead=` attribution block + `window.trackEvent` helper; it was **migrated** to the
> opaque `?lead=` / `token` convention rather than added from scratch.
>
> **⚠️ Deploy ordering:** the base script is now in **manual mode**, so the pageview fires
> only from `track.js`. **Do not deploy the deck changes until `track.js` is live at
> `decks.tristargroup.us`** — otherwise no pageviews fire at all. Until then the edits sit
> safely in the local repos.

---

## 1. What you're changing

Per repo, on **both** the deck page (`index.html`) and the artifact page
(`data/index.html`):

1. **Replace** the existing Plausible base tag with the **manual + props + tagged-events**
   variant, so `track.js` can attach the `token` to the pageview. *(Do not add a second
   base tag — that double-counts pageviews.)* — **done**
2. Add the **TriStar tracker** (`track.js`, served by the app at `decks.tristargroup.us`).
   — **done**
3. **Migrate** the existing inline attribution block from `?lead=`/`tristar_lead`/`lead`
   to the opaque `?lead=`/`tristar_lead`/`token`. — **done**

That's it. **No token-propagation snippet and no per-slide markup were needed** (see §3,
§4 for why). No build-system, framework, or content changes — these are static microsites,
so plain `<script>` tags are sufficient. The existing `window.trackEvent` helper and
`[data-event]` instrumentation are **kept** (now tagged with `token`); `track.js` reuses
`window.plausible` and `window.TRISTAR_TOKEN`.

---

## 2. Base script: REPLACE (both pages, both repos)

The repos currently load (deck page and `data/` page):
```html
<!-- CURRENT — auto-pageview, no props. REMOVE THIS LINE. -->
<script defer data-domain="hbs.tristargroup.us"
        src="https://plausible.io/js/script.tagged-events.js"></script>
```

Replace it with the **manual** variant and add the tracker. The existing
`window.plausible` stub + `window.trackEvent` block immediately below it stay as-is.

### `sales-carousel` (hbs.tristargroup.us) — `index.html` and `data/index.html`
```html
<!-- Plausible: manual pageview + custom props + tagged events -->
<script defer
  data-domain="hbs.tristargroup.us"
  src="https://plausible.io/js/script.manual.pageview-props.tagged-events.js"></script>

<!-- TriStar minideck tracker -->
<script defer
  data-deck="hbs"
  src="https://decks.tristargroup.us/track.js"></script>
```

### `sales-carousel-ai` (ai-cohorts.tristargroup.us) — `index.html` and `data/index.html`
```html
<script defer
  data-domain="ai-cohorts.tristargroup.us"
  src="https://plausible.io/js/script.manual.pageview-props.tagged-events.js"></script>

<script defer
  data-deck="ai-cohorts"
  src="https://decks.tristargroup.us/track.js"></script>
```

> - `data-deck` must match the deck `slug` in the tool's `decks` table (`hbs`, `ai-cohorts`).
> - App domain is **`decks.tristargroup.us`** (locked).
> - **Why manual mode:** the default/tagged-events script auto-fires a pageview with no
>   props, so `?lead=` links can't be segmented. `script.manual.*` lets `track.js` fire the
>   pageview **after** attaching the `token` prop — the thing that makes per-link stats
>   possible. The non-manual script must be removed or you get two pageviews per visit.

---

## 3. Token propagation to the artifact page (`/data/`) — already solved

The deck page links to the artifact page with `target="_blank"`
(`data-event="cta_data_page"`, `href="data/"`), so the deck URL's `?lead=` is **not**
inherited by the new tab. **No link-rewriting is needed**, because the inline attribution
block already **persists the token to `localStorage["tristar_lead"]`** on the deck page, and
`/data/` is **same-origin** (`hbs.tristargroup.us/data/`). The artifact page's own inline
block + `track.js` recover the token from `localStorage` automatically:

```js
window.TRISTAR_TOKEN =
  new URLSearchParams(location.search).get("t")            // present on the deck page
  || localStorage.getItem("tristar_lead")                     // recovered on the /data/ page
  || null;
```

This already ships in all four files (deck + artifact, both repos). The only requirement
is that the prospect visit the deck page first (which sets `localStorage`) before opening
the artifact — which is the actual user flow.

---

## 4. Per-slide labels — slugs live in `track.js` (no deck markup needed)

For **per-slide time** and **furthest-slide-reached**, `track.js` observes the
`<article class="slide">` elements. The slug taxonomy below is **centralized in
`track.js`, keyed by deck slug** (`SLIDES["hbs"]`, `SLIDES["ai-cohorts"]`) — mapping the
1-based slide position to a slug — so the deck repos need **no per-slide attributes**.

Resolution order in `track.js`:
1. `data-slide="<slug>"` on the `<article>` (optional override — add only if you want to
   pin a specific slide's slug from the deck repo);
2. the centralized `SLIDES[deck][index]` map;
3. fallback: `slide_index` (1-based) + a slug derived from `.slide__title` text.

Rules:
- Slugs are **stable, lowercase, kebab-case**, and **shared across decks where slides are
  equivalent** (`overview`, `advanced-disease`, `longitudinal`, `primary-mets`,
  `pre-post-soc`, `pre-post-io`, `stats`, `cta`) so stats compare cleanly.
- **Don't rename a slug once live** — a rename splits its history. Keep the `SLIDES` map in
  `track.js` in lockstep with the deck's slide order; if a deck inserts/reorders slides,
  update the map (or pin the affected slides with `data-slide`).

### Slug taxonomy (encoded in `track.js`, derived from the real slides)

**HBS (`sales-carousel`, 14 slides):**

> Canonical order lives in `minideck-tool/src/lib/slides.ts` (`SLIDE_SLUGS.hbs`) and is
> mirrored in `public/track.js`. Keep this table in sync with those.

| # | Slide title | `data-slide` |
|---|---|---|
| 1 | Overview / intro | `overview` |
| 2 | Imaging + Clinical Data | `imaging-clinical-data` |
| 3 | Breadth of donor profiles | `donor-profiles` |
| 4 | Cohorts available | `cohorts-available` |
| 5 | A core partner for translational programs | `core-partner` |
| 6 | Stats / lab | `stats` |
| 7 | Advanced disease (Stage III/IV) | `advanced-disease` |
| 8 | Sequentially collected (longitudinal) | `longitudinal` |
| 9 | Longitudinal example: NSCLC | `longitudinal-nsclc` |
| 10 | Primary & matched distant metastases | `primary-mets` |
| 11 | Pre & Post SOC treatment | `pre-post-soc` |
| 12 | Pre & Post IO (Pembro/Nivo) treatment | `pre-post-io` |
| 13 | FFPE blocks & TMAs + matched plasma | `ffpe-tma-plasma` |
| 14 | CTA ("Meet Marie") | `cta` |

**AI Cohorts (`sales-carousel-ai`, 17 slides):**

| # | Slide title | `data-slide` |
|---|---|---|
| 1 | Overview / intro | `overview` |
| 2 | Imaging + Clinical Data | `imaging-clinical-data` |
| 3 | Breadth of donor profiles | `donor-profiles` |
| 4 | Cohorts available | `cohorts-available` |
| 5 | Uniquely positioned to support Oncology AI | `positioning` |
| 6 | A repository purpose-built for translational medicine | `repository` |
| 7 | A core partner for translational programs | `core-partner` |
| 8 | Scanning capabilities | `scanning-capabilities` |
| 9 | Stats / lab | `stats` |
| 10 | Advanced disease (Stage III/IV) | `advanced-disease` |
| 11 | Sequentially collected (longitudinal) | `longitudinal` |
| 12 | Longitudinal example: NSCLC | `longitudinal-nsclc` |
| 13 | Primary & matched distant metastases | `primary-mets` |
| 14 | Pre & Post SOC treatment | `pre-post-soc` |
| 15 | Pre & Post IO (Pembro/Nivo) treatment | `pre-post-io` |
| 16 | FFPE blocks & TMAs + matched plasma | `ffpe-tma-plasma` |
| 17 | CTA | `cta` |

> Shared slugs across decks: `overview`, `advanced-disease`, `longitudinal`,
> `primary-mets`, `pre-post-soc`, `pre-post-io`, `stats`, `cta`. Keep these identical.
> **➡ Action for Shaan / repo maintainer:** confirm this taxonomy (or adjust), then it's
> the only decision gating the deck-repo work. Record the final list in each repo's README.

---

## 5. What `track.js` does (reference — built in the app repo, not here)

So the deck maintainer knows what the scripts + attributes feed. **Carousel-aware:**

1. Reads `t` from the query string → `token`. **No token → fires a plain manual pageview
   and does nothing else** (organic visitors aren't link-tracked).
2. Reads `deck` from the script's `data-deck`.
3. Fires the Plausible pageview tagged with props `{ token, deck }` → makes native
   metrics (visits, visit duration, bounce) filterable by token. Reuses `window.plausible`.
4. **Furthest slide reached:** observes `article.slide` via `IntersectionObserver`; emits
   a `Slide Reached` event with `{ token, deck, slide, slide_index }` the first time each
   slide becomes the active/visible slide. The max `slide_index` per visit = depth.
   *(This replaces the scroll-depth milestones, which don't apply to a horizontal carousel.)*
5. **Per-slide time:** times how long each `article.slide` is the visible slide; on
   slide change / `pagehide` / `visibilitychange`, emits `Slide View` with
   `{ token, deck, slide, slide_index, seconds }`. Slug from `data-slide`, else
   index + `slide__title`.
6. On the **`data/` artifact page** (no carousel): fires the token-tagged pageview and
   times total dwell; emits a `Section View` with `{ token, deck, section: "artifact",
   seconds }` on exit. Existing `data_tab_change` / `data_drilldown_open` events continue
   to fire via the page's own `window.trackEvent` and will appear token-tagged.
7. Dependency-free, < ~3KB, safe to load twice.

The deck repos only provide: the replaced (manual) base tag, the tracker tag, and the
migrated `?lead=`/`token` inline block (which persists the token to `localStorage`). All
slide logic + the slug map live in `track.js`.

---

## 6. Acceptance / verification

- [ ] Open `https://hbs.tristargroup.us/?lead=TEST1234` → Plausible (hbs site) shows a
      pageview with custom props `lead = TEST1234` and `deck = hbs`. **Exactly one**
      pageview (confirms the old base tag was removed).
- [ ] Advancing through slides produces `Slide Reached` + `Slide View` events with the
      right `slide` slug / `slide_index` and a plausible `seconds`.
- [ ] After visiting the deck with `?lead=TEST1234`, clicking the artifact link opens
      `data/` in a new tab (URL has **no** `?lead=` — the token is recovered from
      `localStorage`), and that page still records a **token-tagged** pageview + a
      `Section View` with `section = artifact`.
- [ ] Opening the deck URL **without** `?lead=` records a normal pageview and emits **no**
      token-tagged events.
- [ ] Visitor-facing content/layout is byte-for-byte unchanged; existing CTAs
      (`cta_inquire`, `cta_book_meeting`, `data_tab_change`, …) still fire.
- [ ] Repeat all checks for `ai-cohorts.tristargroup.us` with `deck = ai-cohorts`.

---

## 7. Privacy note

Events contain only the opaque `token` — never name, email, or company. The
token↔person mapping exists solely in the tool's database / HubSpot. Add a one-line
internal note that prospect engagement is measured via Plausible.

---

## 8. Plausible setup that must exist for this to register (config, not code)

(Provisioned in Plausible by Shaan — listed here so deck verification doesn't fail
mysteriously.)

- Both deck domains exist as Plausible sites. *(already true)*
- Custom properties allowed: `token`, `deck`, `slide`, `slide_index`, `section`.
- Custom-event goals (optional but recommended for the UI): `Slide Reached`,
  `Slide View`, `Section View`.
