// Matomo analytics for the AutoCoder docs/blog.
// Delivery: Mintlify custom script — any .js in this repo is bundled into every page
// (same mechanism as proxy.js / title.js / win.js). NOTE: Mintlify executes custom
// scripts via its framework loader and SWALLOWS uncaught errors silently — hence the
// per-section try/catch bulkheads + the window.__acDbg breadcrumb trail below.
// Diagnose in DevTools console with:  window.__acDbg
//
// Data spec (data team, 2026-07-02): three events, attributes packed into the Matomo
// event name (e_n) as key=value;key=value, parsed downstream from raw logs:
//   ViewBlogPage  — on EXIT of a blog page: page_name, visit_total_time (ms),
//                   referrer (official_redirect|direct), scroll_depth (10% buckets)
//   SearchBlog    — search_content, one event per executed search (debounced)
//   CtaClick     — page_name, link_name, referrer; ONLY blog-article links whose
//                   destination is the main site (metric: share of blog readers
//                   who navigate to the homepage), NOT every article link
//
// Session UTM params (utd_id/utm_id/utm_source/utm_medium/utm_campaign/utm_term) are
// appended to ViewBlogPage + CtaClick e_n when present, and carried over onto outbound
// main-site links so ad attribution survives the blog -> main-site hop (S6, 2026-07-07).
//
// Matomo siteIds: prod 18, test 17. Unknown hosts -> 17, NEVER prod.
// Kill switch: delete this file (or comment out the body) and push.

(function () {
  if (window.__acBlogAnalytics) return;
  window.__acBlogAnalytics = true;

  const dbg = (window.__acDbg = window.__acDbg || []);
  const mark = (m) => dbg.push(m);
  const guard = (name, fn) => {
    try {
      fn();
      mark(name + ':ok');
    } catch (e) {
      mark(name + ':ERR:' + ((e && e.message) || e));
    }
  };

  // ---------- shared helpers (plain declarations, nothing executes) ----------
  const clean = (s) => String(s || '').replace(/[;=]/g, ' ').replace(/\s+/g, ' ').trim();
  // page_name = title minus the " - AutoCoder" site suffix (title.js already strips emoji).
  const pageName = () =>
    clean((document.title || location.pathname).replace(/\s*[-|–—]\s*AutoCoder\s*$/i, ''));
  const isBlogPath = (path) => /\/blog(\/|$)/.test(path || location.pathname);
  const now = () => Date.now();

  // ALWAYS resolve window._paq at call time — matomo.js REPLACES window._paq with a
  // tracker-proxy object once it loads, so a cached array reference silently eats every
  // later push. (Root cause of SPA pageviews/events never firing while init worked.)
  const paq = (...cmd) => (window._paq = window._paq || []).push(cmd);
  const trackEvent = (name, en) => paq('trackEvent', 'front_event', name, en, 1);

  // Arrival mode, computed once per browsing session (spec enum: official_redirect | direct).
  // Prod main-site -> /docs is same-origin, so document.referrer keeps the full path.
  const MAIN_HOSTS = ['www.autocoder.cc', 'autocoder.cc'];
  function arrival() {
    try {
      const stored = sessionStorage.getItem('__acBlogArrival');
      if (stored) return stored;
      let mode = 'direct';
      if (document.referrer) {
        const ref = new URL(document.referrer);
        if (MAIN_HOSTS.includes(ref.hostname) && !ref.pathname.startsWith('/docs')) {
          mode = 'official_redirect';
        }
      }
      sessionStorage.setItem('__acBlogArrival', mode);
      return mode;
    } catch (err) {
      return 'direct';
    }
  }

  // Session UTM attribution, keyed by ORIGINAL param name (populated in S1 from the
  // URL + sessionStorage; SPA navs strip the query string, so the store is what makes
  // attribution survive past the landing URL). Shared by three consumers: custom
  // dims 5-9 (S1), e_n packing on ViewBlogPage/CtaClick, and outbound carry-over (S6).
  const UTM_PARAMS = ['utd_id', 'utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term'];
  let utms = {};
  const utmSuffix = () =>
    UTM_PARAMS.filter((p) => utms[p]).map((p) => `;${p}=${clean(utms[p])}`).join('');

  // Main-site destination gate shared by CtaClick (S4) and UTM carry-over (S6):
  // MAIN_HOSTS hostname with a non-/docs path. Returns a URL object or null
  // (mailto:, javascript:, in-page anchors, and blog->blog links all fail it).
  function mainSiteDest(href) {
    try {
      const u = new URL(href);
      if (MAIN_HOSTS.includes(u.hostname) && !u.pathname.startsWith('/docs')) return u;
    } catch (err) { /* malformed / non-http scheme */ }
    return null;
  }

  // ---------- ViewBlogPage lifecycle state (defs only; wired in a bulkhead below) ----------
  // ONE event per page view, emitted when the user LEAVES the page (SPA nav away, or
  // pagehide = close/reload/cross-site nav) — per data-team feedback 2026-07-03.
  // Hiding the tab only PAUSES the clock (hidden time is excluded from visit_total_time);
  // no mid-view sends. Accepted trade-off: a backgrounded tab killed by the OS without
  // the user returning never fires pagehide, so that view's event is lost — the price of
  // single-event-at-leave semantics vs the old segment-on-hide approach.
  let page = null;
  function beginPage() {
    page = {
      name: pageName(),
      isBlog: isBlogPath(),
      accumMs: 0,
      segStart: document.visibilityState === 'hidden' ? null : now(),
      maxScroll: 0,
    };
    updateScroll();
  }
  function updateScroll() {
    if (!page) return;
    const doc = document.documentElement;
    const total = Math.max(doc.scrollHeight, 1);
    const seen = Math.min(total, (window.pageYOffset || doc.scrollTop || 0) + window.innerHeight);
    const pct = Math.min(100, Math.round((seen / total) * 10) * 10); // 10% buckets per spec
    if (pct > page.maxScroll) page.maxScroll = pct;
  }
  function pauseTiming() {
    if (page && page.segStart) { page.accumMs += now() - page.segStart; page.segStart = null; }
  }
  function resumeTiming() {
    if (page && !page.segStart) page.segStart = now();
  }
  function flush() {
    if (!page) return;
    pauseTiming();
    if (!page.isBlog || page.accumMs < 100) return; // non-blog pages / nothing meaningful since last send
    trackEvent(
      'ViewBlogPage',
      `page_name=${page.name};visit_total_time=${page.accumMs};referrer=${arrival()};scroll_depth=${page.maxScroll}%` +
        utmSuffix()
    );
    page.accumMs = 0;
  }

  // ---------- SPA route-change core (def only) ----------
  let lastUrl = location.href;
  function onRouteChange() {
    const current = location.href;
    if (current === lastUrl) return; // dedupes double-dispatch + replaceState noise (e.g. win.js /welcome -> /)
    const prev = lastUrl;
    lastUrl = current;

    try { flush(); } catch (e) { mark('flush:ERR:' + ((e && e.message) || e)); }

    // Stale-title guard: Mintlify (and title.js's emoji strip) update the title async
    // after the route change; title-per-hit is required (sheet rows 9-12).
    const titleAtNav = document.title;
    let waited = 0;
    const STEP = 50;
    const MAX_WAIT = 500;
    (function waitForTitle() {
      if (document.title !== titleAtNav || waited >= MAX_WAIT) {
        paq('setReferrerUrl', prev);
        paq('setCustomUrl', current);
        paq('setDocumentTitle', document.title);
        paq('trackPageView');
        paq('enableLinkTracking'); // re-scan links in newly rendered content
        beginPage(); // start timing the new page
      } else {
        waited += STEP;
        setTimeout(waitForTitle, STEP);
      }
    })();
  }

  // ==================== bulkheaded install sections ====================

  // ---- S1: Matomo init + initial pageview ----
  guard('init', () => {
    const host = window.location.hostname;
    const isProd = host === 'www.autocoder.cc' || host === 'autocoder.cc';
    const SITE_ID = isProd ? '18' : '17'; // 18 = prod blog, 17 = test blog + any unknown host

    paq('setTrackerUrl', 'https://track.koudingvip.com/matomo.php');
    paq('setSiteId', SITE_ID);
    paq('enableHeartBeatTimer', 30); // Matomo-UI sanity; platform read-time comes from ViewBlogPage
    paq('enableLinkTracking');
    paq('setRequestMethod', 'POST');
    paq('alwaysUseSendBeacon'); // exit-time ViewBlogPage must survive tab close/navigation

    // Ad/marketing attribution -> Matomo custom dimensions (data team, 2026-07-03).
    // Mirrors the main site's mapping (MatomoTracker.ts:170-190):
    //   dim5 = utd_id (falls back to utm_id), dim6 = utm_source, dim7 = utm_medium,
    //   dim8 = utm_campaign, dim9 = utm_term. Params with no value are omitted.
    // First-touch values persist for the session: SPA navs strip the query string and
    // in-docs full-loads land on UTM-less URLs, but the visit keeps its attribution.
    // Inner try/catch: attribution must never block the pageview below.
    try {
      // Stored by ORIGINAL param name (pre-2026-07-07 it was dim id) so the S6
      // carry-over can reproduce the exact params on outbound links. URL beats
      // the store on a fresh full load; the store covers SPA navs (query gone).
      try { utms = JSON.parse(sessionStorage.getItem('__acBlogUtm') || '{}'); } catch (e) { /* fresh */ }
      const qs = new URLSearchParams(location.search);
      UTM_PARAMS.forEach((p) => {
        const v = qs.get(p);
        if (v) utms[p] = v;
      });
      const dims = {
        5: utms.utd_id || utms.utm_id,
        6: utms.utm_source,
        7: utms.utm_medium,
        8: utms.utm_campaign,
        9: utms.utm_term,
      };
      Object.keys(dims).forEach((id) => {
        if (dims[id]) paq('setCustomDimension', Number(id), dims[id]);
      });
      try { sessionStorage.setItem('__acBlogUtm', JSON.stringify(utms)); } catch (e) { /* private mode */ }
    } catch (err) {
      mark('utm:ERR:' + ((err && err.message) || err));
    }

    paq('trackPageView'); // initial load; SPA navigations handled by S2

    (function loadMatomo(src, fallback) {
      const s = document.createElement('script');
      s.async = true;
      s.src = src;
      if (fallback) s.onerror = () => loadMatomo(fallback);
      document.head.appendChild(s);
    })(
      'https://productp.s3.us-west-2.amazonaws.com/background/aigcode-front-main/ai-assets/vendor/matomo/matomo.js',
      'https://track.koudingvip.com/matomo.js'
    );
  });

  // ---- S2: SPA pageview wiring (installed EARLY so nothing later can kill it) ----
  // title.js dispatches 'pushstate'/'replacestate'; we listen + wrap history ourselves +
  // poll as catch-all (framework may call a pre-captured pushState reference, bypassing
  // wrappers — the reason win.js polls). URL dedupe makes the overlap harmless.
  guard('spa', () => {
    ['pushstate', 'replacestate', 'popstate'].forEach((ev) =>
      window.addEventListener(ev, onRouteChange)
    );
    const { pushState, replaceState } = window.history;
    window.history.pushState = function (...args) {
      const r = pushState.apply(window.history, args);
      onRouteChange();
      return r;
    };
    window.history.replaceState = function (...args) {
      const r = replaceState.apply(window.history, args);
      onRouteChange();
      return r;
    };
    setInterval(() => {
      if (location.href !== lastUrl) onRouteChange();
    }, 300);
  });

  // ---- S3: ViewBlogPage lifecycle listeners + landing-page timer ----
  guard('lifecycle', () => {
    window.addEventListener('scroll', updateScroll, true); // capture: catches inner-container scrolls
    document.addEventListener('visibilitychange', () => {
      // Tab hidden = pause the clock (NO event); visible again = resume.
      if (document.visibilityState === 'hidden') pauseTiming();
      else resumeTiming();
    });
    window.addEventListener('pagehide', flush); // the real leave: close / reload / cross-site nav
    window.addEventListener('pageshow', resumeTiming); // bfcache restore: resume timing the same view

    // page_name single source of truth (data-team bug 2026-07-06: CtaClick vs ViewBlogPage
    // names diverged). Mintlify sets the title ASYNC after route changes and title.js strips
    // emoji async, so a name frozen at entry can go stale. Both events now read page.name,
    // and this observer re-syncs it whenever the <title> settles. (Assumes Mintlify's
    // observed order: title updates AFTER the route change — verified in recon.)
    const titleEl = document.querySelector('title');
    if (titleEl && typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        if (page) page.name = pageName();
      }).observe(titleEl, { childList: true });
    }

    beginPage(); // start timing the LANDING page (direct links to posts!)
  });

  // ---- S4: CtaClick (blog-article links -> main site) ----
  // Metric (data team, 2026-07-07): proportion of users who navigate from the blog
  // to the homepage. So the event fires ONLY for clicks on ARTICLE pages (the /blog
  // index would inflate the denominator with blog->blog card clicks) on links whose
  // DESTINATION is the main site — same MAIN_HOSTS as arrival(), non-/docs path, so
  // blog->homepage is measured symmetrically with homepage->blog. Numerator/denominator
  // join: distinct users with CtaClick / distinct users with ViewBlogPage per page_name.
  guard('cta', () => {
    const isArticlePath = () => /\/blog\/./.test(location.pathname);
    document.addEventListener(
      'click',
      (e) => {
        if (!isArticlePath()) return;
        let el = e.target;
        while (el && el !== document && el.tagName !== 'A') el = el.parentNode;
        if (!el || el === document || !el.href) return;

        // Destination gate: main site only (shared helper; also subsumes the old
        // '#' in-page-anchor check and blog->blog links).
        if (!mainSiteDest(el.href)) return;

        // "within a blog article": scope to content containers so sidebar/nav chrome
        // doesn't spam TopN CTR. Loosen if real CTAs turn out to live outside.
        if (!el.closest('article, main, [role="main"]')) return;

        const linkName =
          clean(el.textContent).slice(0, 80) || clean(el.getAttribute('aria-label')) || el.hostname;
        // page.name (not a live title read) so CtaClick and ViewBlogPage report the
        // IDENTICAL page_name for a given view — their platform joins on it.
        // referrer + UTMs added 2026-07-07: the data team ties each blog->main-site
        // click back to the arrival source and ad attribution of the same visit.
        trackEvent(
          'CtaClick',
          `page_name=${(page && page.name) || pageName()};link_name=${linkName};referrer=${arrival()}` +
            utmSuffix()
        );
      },
      true // capture phase so the SPA router can't swallow the event first
    );
  });

  // ---- S5: SearchBlog ----
  // Live endpoint (verified in DevTools 2026-07-02): POST leaves.mintlify.com/api/search
  // with body {query, filters}. Mintlify has migrated backends before (proxy.js targets
  // the older api.mintlifytrieve.com), so match both; payload field is `query` in both.
  // Fires per keystroke -> debounce = one event per executed search. proxy.js also wraps
  // window.fetch; both wrappers call through, so load order doesn't matter.
  guard('search', () => {
    const SEARCH_URL = /leaves\.mintlify\.com\/api\/search|mintlifytrieve\.com/;
    let searchTimer = null;
    const queueSearch = (q) => {
      q = clean(q);
      if (!q) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => trackEvent('SearchBlog', `search_content=${q}`), 1500);
    };
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (SEARCH_URL.test(url)) {
          if (init && typeof init.body === 'string') {
            queueSearch(JSON.parse(init.body).query || '');
          } else if (input && typeof input.clone === 'function') {
            // Body shipped inside a Request object: clone (original stays readable) and read async.
            input.clone().text()
              .then((t) => queueSearch(JSON.parse(t).query || ''))
              .catch(() => {});
          }
        }
      } catch (err) {
        /* never break the page's own fetch */
      }
      return origFetch.apply(this, arguments);
    };
  });

  // ---- S6: UTM carry-over onto outbound main-site links (data team, 2026-07-07) ----
  // A visitor who landed on the blog with ad attribution must keep it when they
  // continue to the main site via ANY link — header/footer chrome included, hence
  // document-wide, NOT article-scoped like S4 (S4 is the metric, S6 is attribution).
  // By click time the current URL usually has no query left (SPA navs strip it), so
  // params come from the session store. Rewrite on mousedown AND click, capture
  // phase: mousedown catches middle-click/open-in-new-tab, click catches keyboard
  // activation. Idempotent, and never overwrites a param the link author set.
  guard('utmCarry', () => {
    const rewrite = (e) => {
      let el = e.target;
      while (el && el !== document && el.tagName !== 'A') el = el.parentNode;
      if (!el || el === document || !el.href) return;
      const dest = mainSiteDest(el.href);
      if (!dest) return;
      let changed = false;
      UTM_PARAMS.forEach((p) => {
        if (utms[p] && !dest.searchParams.has(p)) {
          dest.searchParams.set(p, utms[p]);
          changed = true;
        }
      });
      if (changed) el.href = dest.href;
    };
    ['mousedown', 'click'].forEach((ev) => document.addEventListener(ev, rewrite, true));
  });

  mark('done@' + location.pathname);
})();
