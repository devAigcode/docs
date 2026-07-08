// Rewrites referral links to the current environment's origin on non-production
// hosts, so the same content works on prod (autocoder.cc) and test deployments
// without hardcoding the test domain anywhere.
(function () {
  const PROD_HOSTS = ['autocoder.cc', 'www.autocoder.cc'];
  if (PROD_HOSTS.includes(window.location.hostname)) return;

  const SELECTOR =
    'a[href^="https://autocoder.cc/?invite_popup"], a[href^="https://www.autocoder.cc/?invite_popup"]';

  const rewrite = () => {
    document.querySelectorAll(SELECTOR).forEach((a) => {
      const u = new URL(a.href);
      a.href = window.location.origin + u.pathname + u.search + u.hash;
    });
  };

  new MutationObserver(rewrite).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  rewrite();
})();
