// Matomo analytics for the AutoCoder docs/blog.
// Delivery: Mintlify custom script — any .js in this repo is bundled into every page
// (same mechanism as proxy.js / title.js / win.js).
//
// Data spec (data team, 2026-07-02): three events, attributes packed into the Matomo
// event name (e_n) as key=value;key=value, parsed downstream from raw logs:
//   ViewBlogPage  — on EXIT of a blog page: page_name, visit_total_time (ms),
//                   referrer (official_redirect|direct), scroll_depth (10% buckets)
//   SearchBlog    — search_content, one event per executed search (debounced)
//   cta_click     — page_name, link_name, for links inside blog articles
//
// Matomo siteIds: prod 18, test 17. Unknown hosts -> 17, NEVER prod.
// Kill switch: delete this file (or comment out the body) and push.

(function () {
  if (window.__acBlogAnalytics) return;
  window.__acBlogAnalytics = true;

  // ---------- Matomo init ----------
  const host = window.location.hostname;
  const isProd = host === 'www.autocoder.cc' || host === 'autocoder.cc';
  const SITE_ID = isProd ? '18' : '17'; // 18 = prod blog, 17 = test blog + any unknown host

  const _paq = (window._paq = window._paq || []);
  _paq.push(['setTrackerUrl', 'https://track.koudingvip.com/matomo.php']);
  _paq.push(['setSiteId', SITE_ID]);
  _paq.push(['enableHeartBeatTimer', 30]); // Matomo-UI sanity view; the platform's read-time comes from ViewBlogPage
  _paq.push(['enableLinkTracking']);
  _paq.push(['setRequestMethod', 'POST']);
  _paq.push(['alwaysUseSendBeacon']); // exit-time ViewBlogPage must survive tab close/navigation
  _paq.push(['trackPageView']); // initial load; SPA navigations handled below

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

  // ---------- helpers ----------
  // Values are embedded in e_n as key=value;key=value — strip the delimiters.
  const clean = (s) => String(s || '').replace(/[;=]/g, ' ').replace(/\s+/g, ' ').trim();
  // page_name = title minus the " - AutoCoder" site suffix (title.js already strips emoji).
  const pageName = () =>
    clean((document.title || location.pathname).replace(/\s*[-|–—]\s*AutoCoder\s*$/i, ''));
  const isBlogPath = (path) => /\/blog(\/|$)/.test(path || location.pathname);
  const trackEvent = (name, en) => _paq.push(['trackEvent', 'front_event', name, en, 1]);

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

  // ---------- ViewBlogPage lifecycle (exit event: dwell segments + scroll depth) ----------
  // Each send is the dwell accumulated since the last send; hide tab -> event, come back
  // and leave again -> another event. Platform sums visit_total_time per page_name.
  // Accumulator resets on send, so hidden -> pagehide back-to-back can't double-count.
  let page = null;
  const now = () => Date.now();

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
  const pause = () => {
    if (page && page.segStart) { page.accumMs += now() - page.segStart; page.segStart = null; }
  };
  const resume = () => {
    if (page && !page.segStart) page.segStart = now();
  };
  function flush() {
    if (!page) return;
    pause();
    if (!page.isBlog || page.accumMs < 100) return; // non-blog pages / nothing meaningful since last send
    trackEvent(
      'ViewBlogPage',
      `page_name=${page.name};visit_total_time=${page.accumMs};referrer=${arrival()};scroll_depth=${page.maxScroll}%`
    );
    page.accumMs = 0;
  }

  window.addEventListener('scroll', updateScroll, true); // capture: catches inner-container scrolls too
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else resume();
  });
  window.addEventListener('pagehide', flush);
  beginPage(); // start timing the LANDING page (direct links to posts!); SPA navs re-begin via onRouteChange

  // ---------- SPA pageviews ----------
  // title.js already wraps pushState/replaceState and dispatches 'pushstate'/'replacestate'
  // window events; we listen to those + popstate. We also wrap history ourselves as a
  // defensive fallback (URL dedupe makes double-dispatch harmless) so tracking survives
  // if title.js is ever removed.
  let lastUrl = location.href;

  function onRouteChange() {
    const current = location.href;
    if (current === lastUrl) return; // dedupes double-dispatch + replaceState noise (e.g. win.js /welcome -> /)
    const prev = lastUrl;
    lastUrl = current;

    flush(); // close out the page being left BEFORE tracking the new one

    // Stale-title guard: Mintlify (and title.js's emoji strip) update the title async
    // after the route change; title-per-hit is required (sheet rows 9-12).
    const titleAtNav = document.title;
    let waited = 0;
    const STEP = 50;
    const MAX_WAIT = 500;
    (function waitForTitle() {
      if (document.title !== titleAtNav || waited >= MAX_WAIT) {
        _paq.push(['setReferrerUrl', prev]);
        _paq.push(['setCustomUrl', current]);
        _paq.push(['setDocumentTitle', document.title]);
        _paq.push(['trackPageView']);
        _paq.push(['enableLinkTracking']); // re-scan links in newly rendered content
        beginPage(); // start timing the new page
      } else {
        waited += STEP;
        setTimeout(waitForTitle, STEP);
      }
    })();
  }

  ['pushstate', 'replacestate', 'popstate'].forEach((ev) =>
    window.addEventListener(ev, onRouteChange)
  );
  (function (history) {
    const { pushState, replaceState } = history;
    history.pushState = function (...args) {
      const r = pushState.apply(history, args);
      onRouteChange();
      return r;
    };
    history.replaceState = function (...args) {
      const r = replaceState.apply(history, args);
      onRouteChange();
      return r;
    };
  })(window.history);

  // Fallback: the framework captures history.pushState at hydration (before custom
  // scripts run) and calls that reference directly, bypassing wrappers — the reason
  // win.js polls for URL changes instead. Poll as the catch-all; the URL dedupe in
  // onRouteChange makes overlap with the listeners above harmless.
  setInterval(() => {
    if (location.href !== lastUrl) onRouteChange();
  }, 300);

  // ---------- cta_click (hyperlinks inside blog articles) ----------
  document.addEventListener(
    'click',
    (e) => {
      if (!isBlogPath()) return;
      let el = e.target;
      while (el && el !== document && el.tagName !== 'A') el = el.parentNode;
      if (!el || el === document || !el.href) return;
      if ((el.getAttribute('href') || '').startsWith('#')) return; // in-page anchor

      // "within a blog article": scope to content containers so sidebar/nav chrome
      // doesn't spam TopN CTR. Loosen if real CTAs turn out to live outside.
      const inContent = el.closest('article, main, [role="main"]');
      if (!inContent) return;

      const linkName =
        clean(el.textContent).slice(0, 80) || clean(el.getAttribute('aria-label')) || el.hostname;
      trackEvent('cta_click', `page_name=${pageName()};link_name=${linkName}`);
    },
    true // capture phase so the SPA router can't swallow the event first
  );

  // ---------- SearchBlog ----------
  // Live endpoint (verified in DevTools 2026-07-02): POST leaves.mintlify.com/api/search
  // with body {query, filters}. Mintlify has migrated backends before (proxy.js targets the
  // older api.mintlifytrieve.com/api/chunk/autocomplete), so match both; payload field is
  // `query` in both. Fires per keystroke -> debounce = one event per executed search.
  // proxy.js also wraps window.fetch; both wrappers call through, so load order doesn't matter.
  const SEARCH_URL = /leaves\.mintlify\.com\/api\/search|mintlifytrieve\.com/;
  let searchTimer = null;
  function queueSearch(q) {
    q = clean(q);
    if (!q) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => trackEvent('SearchBlog', `search_content=${q}`), 1500);
  }
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (SEARCH_URL.test(url)) {
        if (init && typeof init.body === 'string') {
          queueSearch(JSON.parse(init.body).query || '');
        } else if (input && typeof input.clone === 'function') {
          // Body shipped inside a Request object: clone (so the original stays readable)
          // and read asynchronously.
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
})();
