// Orbio launch chip on the token page (2026-11-26): "Orbio launch · Agent #N" beside the chain tag for tokens launched
// from Orbio's agent vault on Robinhood Chain. The label comes from our own data (x/token carries launchpad). Additive:
// one read per Robinhood token page, nothing else on the page changes.
(function () {
  'use strict';
  var seen = {}, busy = false;
  function route() { var m = /^#\/token\/4663\/(0x[0-9a-fA-F]{40})/.exec(location.hash || ''); return m ? m[1].toLowerCase() : null; }
  function place(token, lp) {
    if (route() !== token) return;
    var chain = document.querySelector('.token-meta .lt-chain');
    if (!chain || chain.parentElement.querySelector('.lt-orbio')) return;
    var s = document.createElement('span');
    s.className = 'lt-chain lt-orbio'; s.textContent = (window.innerWidth < 520 ? 'Orbio #' + lp.agentId : lp.label + ' · Agent #' + lp.agentId); s.style.whiteSpace = 'nowrap'; s.style.flexShrink = '0'; s.title = 'Launched on Orbio (agent #' + lp.agentId + ')';
    chain.insertAdjacentElement('afterend', s);
  }
  function check() {
    var token = route(); if (!token) return;
    if (seen[token] !== undefined) { if (seen[token]) place(token, seen[token]); return; }
    if (busy) return; busy = true;
    fetch('/api/terminal/x/token/4663/' + token, {headers: {accept: 'application/json'}}).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) { seen[token] = b && b.launchpad && b.launchpad.id === 'orbio' ? b.launchpad : null; if (seen[token]) place(token, seen[token]); })
      .catch(function () {}).then(function () { busy = false; });
  }
  var t = null;
  new MutationObserver(function () { if (t) return; t = setTimeout(function () { t = null; check(); }, 250); }).observe(document.documentElement, {childList: true, subtree: true});
  addEventListener('hashchange', check); check();
})();
