/*!
 * TriStar Minideck tracker — served at https://decks.tristargroup.us/track.js
 * Pairs with Plausible's MANUAL base script (script.manual.pageview-props.tagged-events.js).
 * Dependency-free, safe to load twice. No PII — only the opaque `token`.
 *
 * Plausible (counts): tagged pageview, `Slide Reached` (depth), `Slide View` (per-slide
 *   view counts), `Section View` (artifact opened).
 * Engagement collector (true time): measures ENGAGED time — only while the page is visible,
 *   so a left-open background tab does NOT inflate it — and beacons cumulative seconds
 *   (total + per-slide) to /api/ingest on a 15s heartbeat and on hide/unload. Plausible
 *   cannot scope session duration to a per-link token, so time-on-page comes from here.
 */
(function () {
  "use strict";
  if (window.__tristarTracker) return; // safe to load twice
  window.__tristarTracker = true;

  var el = document.currentScript || document.querySelector("script[data-deck]");
  var deck = (el && el.getAttribute("data-deck")) || "";
  var ingestUrl = "https://decks.tristargroup.us/api/ingest";
  try {
    if (el && el.src) ingestUrl = new URL(el.src).origin + "/api/ingest";
  } catch {}

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

  // No token → organic/untracked visit. Pageview recorded; stop (no engagement beacons).
  if (!token) return;

  // CTA-click capture: the decks fire data-event="cta_*" on Book-a-meeting / Inquire / etc.
  // Beacon those to /api/ingest (highest-intent signal). Capture phase so it fires before
  // any navigation (e.g. mailto links).
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest && e.target.closest("[data-event]");
      if (!el) return;
      var name = el.getAttribute("data-event") || "";
      if (name.indexOf("cta_") !== 0) return;
      try {
        var data = JSON.stringify({ token: token, kind: "cta", event: name });
        if (navigator.sendBeacon) navigator.sendBeacon(ingestUrl, new Blob([data], { type: "text/plain" }));
        else fetch(ingestUrl, { method: "POST", body: data, keepalive: true, headers: { "Content-Type": "text/plain" } });
      } catch {}
    },
    true,
  );

  var SLIDES = {
    hbs: ["overview", "advanced-disease", "longitudinal", "primary-mets", "pre-post-soc", "pre-post-io", "stats", "cta"],
    "ai-cohorts": ["overview", "imaging-clinical-data", "donor-profiles", "cohorts-available", "positioning", "repository", "core-partner", "scanning-capabilities", "stats", "advanced-disease", "longitudinal", "longitudinal-nsclc", "primary-mets", "pre-post-soc", "pre-post-io", "ffpe-tma-plasma", "cta"],
  };

  function slugFor(article, index) {
    var attr = article.getAttribute("data-slide");
    if (attr) return attr;
    var map = SLIDES[deck];
    if (map && map[index]) return map[index];
    var title = article.querySelector(".slide__title");
    if (title) {
      return title.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }
    return "slide-" + (index + 1);
  }

  // ── Engagement (visible-only) time ────────────────────────────────────────
  var surface = "deck";
  var engagedMs = 0;
  var visStart = document.visibilityState === "visible" ? Date.now() : null;
  var curSlide = null;
  var curSlideStart = null;
  var slideMs = {};

  function bank() {
    var now = Date.now();
    if (visStart != null) {
      engagedMs += now - visStart;
      visStart = now;
    }
    if (curSlide != null && curSlideStart != null) {
      slideMs[curSlide] = (slideMs[curSlide] || 0) + (now - curSlideStart);
      curSlideStart = now;
    }
  }

  function setActiveSlide(slug) {
    bank();
    curSlide = slug;
    curSlideStart = visStart != null ? Date.now() : null;
  }

  function beacon() {
    bank();
    var per = {};
    for (var k in slideMs)
      if (Object.prototype.hasOwnProperty.call(slideMs, k)) per[k] = Math.round(slideMs[k] / 1000);
    var data = JSON.stringify({
      token: token,
      surface: surface,
      seconds: Math.round(engagedMs / 1000),
      perSlide: per,
    });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(ingestUrl, new Blob([data], { type: "text/plain" }));
      else fetch(ingestUrl, { method: "POST", body: data, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch {}
  }

  function start() {
    var slides = Array.prototype.slice.call(document.querySelectorAll("article.slide"));
    surface = slides.length ? "deck" : "artifact";

    if (slides.length && "IntersectionObserver" in window) {
      var reached = {};
      var enterAt = {};

      function emitView(idx, slug) {
        var secs = Math.round((Date.now() - enterAt[idx]) / 1000);
        enterAt[idx] = null;
        if (secs > 0) fire("Slide View", { slide: slug, slide_index: String(idx + 1), seconds: String(secs) });
      }

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            var idx = slides.indexOf(entry.target);
            if (idx < 0) return;
            var slug = slugFor(entry.target, idx);
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              if (!reached[slug]) {
                reached[slug] = true;
                fire("Slide Reached", { slide: slug, slide_index: String(idx + 1) });
              }
              enterAt[idx] = Date.now();
              setActiveSlide(slug); // engagement: this slide is now active
            } else if (enterAt[idx] != null) {
              emitView(idx, slug);
            }
          });
        },
        { threshold: [0, 0.5, 1] },
      );
      slides.forEach(function (s) {
        io.observe(s);
      });
    } else {
      // Artifact / data page — register the open immediately (reliable Yes/No).
      fire("Section View", { section: "artifact", seconds: "0" });
    }

    // Engagement listeners (both surfaces).
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        bank();
        visStart = null;
        curSlideStart = null;
        beacon();
      } else {
        visStart = Date.now();
        if (curSlide != null) curSlideStart = Date.now();
      }
    });
    window.addEventListener("pagehide", beacon);
    setInterval(beacon, 15000); // heartbeat so dwell is captured without a clean exit
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
