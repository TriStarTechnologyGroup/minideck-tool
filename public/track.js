/*!
 * TriStar Minideck tracker — served at https://decks.tristargroup.us/track.js
 * Pairs with Plausible's MANUAL base script (script.manual.pageview-props.tagged-events.js).
 * Dependency-free, safe to load twice. No PII — only the opaque `token`.
 *
 * What it does:
 *   1. Resolves the prospect token (?t=, persisted to localStorage, same-origin so the
 *      /data/ artifact page recovers it automatically).
 *   2. Fires ONE Plausible pageview tagged { token, deck } so native metrics
 *      (visit duration, bounce, visits) are filterable per link.
 *   3. Carousel decks: emits `Slide Reached` (furthest-slide depth) + `Slide View`
 *      (per-slide seconds) by observing <article class="slide"> elements.
 *   4. Artifact page (no carousel): emits `Section View` { section:"artifact", seconds }.
 *
 * Slide slugs are centralized here (keyed by deck) so the deck repos need no per-slide
 * markup; an optional data-slide="..." on an <article> overrides the map.
 */
(function () {
  "use strict";
  if (window.__tristarTracker) return; // safe to load twice
  window.__tristarTracker = true;

  var el =
    document.currentScript || document.querySelector("script[data-deck]");
  var deck = (el && el.getAttribute("data-deck")) || "";

  // --- token resolution -----------------------------------------------------
  function resolveToken() {
    if (window.TRISTAR_TOKEN) return window.TRISTAR_TOKEN;
    try {
      var q = new URLSearchParams(location.search).get("t");
      if (q) {
        try {
          localStorage.setItem("tristar_t", q);
        } catch {}
        return q;
      }
      return localStorage.getItem("tristar_t");
    } catch {
      return null;
    }
  }
  var token = resolveToken();

  // Plausible queue stub (the deck page defines one too; this is a fallback).
  window.plausible =
    window.plausible ||
    function () {
      (window.plausible.q = window.plausible.q || []).push(arguments);
    };

  function fire(name, props) {
    var p = { deck: deck };
    if (token) p.token = token;
    if (props)
      for (var k in props)
        if (Object.prototype.hasOwnProperty.call(props, k)) p[k] = props[k];
    window.plausible(name, { props: p });
  }

  // 1. Manual pageview (tagged). In manual mode nothing fires unless we do.
  fire("pageview");

  // No token → organic/untracked visit. Pageview recorded; stop.
  if (!token) return;

  // --- slide slug taxonomy (keyed by deck slug) -----------------------------
  var SLIDES = {
    hbs: [
      "overview",
      "advanced-disease",
      "longitudinal",
      "primary-mets",
      "pre-post-soc",
      "pre-post-io",
      "stats",
      "cta",
    ],
    "ai-cohorts": [
      "overview",
      "imaging-clinical-data",
      "donor-profiles",
      "cohorts-available",
      "positioning",
      "repository",
      "core-partner",
      "scanning-capabilities",
      "stats",
      "advanced-disease",
      "longitudinal",
      "longitudinal-nsclc",
      "primary-mets",
      "pre-post-soc",
      "pre-post-io",
      "ffpe-tma-plasma",
      "cta",
    ],
  };

  function slugFor(article, index) {
    var attr = article.getAttribute("data-slide");
    if (attr) return attr;
    var map = SLIDES[deck];
    if (map && map[index]) return map[index];
    var title = article.querySelector(".slide__title");
    if (title) {
      return title.textContent
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
    return "slide-" + (index + 1);
  }

  function start() {
    var slides = Array.prototype.slice.call(
      document.querySelectorAll("article.slide"),
    );

    if (slides.length && "IntersectionObserver" in window) {
      var reached = {}; // slug -> true (Slide Reached fired once per visit)
      var enterAt = {}; // index -> ms when it became the active slide

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            var idx = slides.indexOf(entry.target);
            if (idx < 0) return;
            var slug = slugFor(entry.target, idx);
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              if (!reached[slug]) {
                reached[slug] = true;
                fire("Slide Reached", {
                  slide: slug,
                  slide_index: String(idx + 1),
                });
              }
              enterAt[idx] = Date.now();
            } else if (enterAt[idx] != null) {
              emitView(idx, slug);
            }
          });
        },
        { threshold: [0, 0.5, 1] },
      );

      function emitView(idx, slug) {
        var secs = Math.round((Date.now() - enterAt[idx]) / 1000);
        enterAt[idx] = null;
        if (secs > 0)
          fire("Slide View", {
            slide: slug,
            slide_index: String(idx + 1),
            seconds: String(secs),
          });
      }

      function flush() {
        Object.keys(enterAt).forEach(function (idx) {
          if (enterAt[idx] != null)
            emitView(Number(idx), slugFor(slides[idx], Number(idx)));
        });
      }

      slides.forEach(function (s) {
        io.observe(s);
      });
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") flush();
      });
    } else {
      // Artifact / data page — no carousel. Register the open IMMEDIATELY on load:
      // exit-fired events (pagehide/visibilitychange) often don't flush before the page
      // goes away, so "artifact opened?" was being missed. The table only needs Yes/No.
      fire("Section View", { section: "artifact", seconds: "0" });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
