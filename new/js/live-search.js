/* live-search.js: top-bar search on live data. Written by Claude.
   Local rows (every token the live lists already hold) answer at once; from 2 characters the live search
   route (/api/terminal/x/search: name, symbol or contract on every chain) is asked after 300 ms, and its hits
   join the same dropdown. Results open #/token/<chain>/<address>. When the route is unavailable the dropdown
   keeps the local rows. */
(function () {
  "use strict";
  var seq = 0, timer = null;

  function pool() {
    var live = window.QHLive ? window.QHLive.all() : [], fx = window.QH_FIXTURES || [];
    return live.length ? live.concat(fx) : null;
  }
  function relink(drop) {
    if (!drop || !window.QHLive) return;
    drop.querySelectorAll(".qs-result").forEach(function (row) {
      var a = row.dataset.address, t = a && a.indexOf("/") < 0 ? window.QHLive.find(a) : null;
      if (t && t.live) row.dataset.address = encodeURIComponent(t.chainId) + "/" + encodeURIComponent(t.address);
    });
  }
  function attach(input) {
    if (!input || !window.Search || input.dataset.live) return;
    input.dataset.live = "1";
    if (!window.QH_FIXTURES && Array.isArray(window.QH_TOKENS)) window.QH_FIXTURES = window.QH_TOKENS.slice();
    var show = window.Search.showResults.bind(window.Search);
    window.Search.showResults = function (v) {
      var p = pool(); if (p) window.QH_TOKENS = p;
      show(v); relink(window.Search.dropdown);
    };
    input.addEventListener("input", function () {
      var v = input.value.trim(), my = ++seq;
      clearTimeout(timer);
      if (v.length < 2) return;
      timer = setTimeout(function () {
        window.QHLive.search(v).then(function (r) {
          if (my !== seq || input.value.trim() !== v || !r.ok) return;
          window.Search.showResults(v);
        });
      }, 300);
    });
  }
  window.LiveSearch = { attach: attach };
})();
