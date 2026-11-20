/* live-boot.js: one shared reader for the market lists, so every screen (Pulse, Discover, Community, search)
   sees the same live rows through window.QHLive.all() and nobody polls the same route twice.
   Lists: trending (24h volume stands in while trending is empty), new, bonding, migrated, and QHooks launches.
   Runs only while a list screen is open (Pulse, Discover, Community, More), 10 s visible / 30 s when nothing
   changed, paused when the tab is hidden. All five routes are colo-cached with ETag/304 on qhooks.com.
   After each read it fires window event "qhlive" with detail {lists, observedAt, ok}. Written by Claude. */
(function () {
  "use strict";
  var L = window.QHLive, last = null, poller = null;
  var LIST_ROUTES = /^#\/(pulse|discover|community|more)?($|[/?])/;

  var IDS = { Robinhood: "4663", Base: "8453", Solana: "solana", BNB: "56", Ethereum: "1", Arbitrum: "42161", Elysium: "99901" };
  function chainId() { return IDS[window.QH_CHAIN || ""] || ""; }
  window.addEventListener("qh-chain", function () { if (poller) poller.now(); });
  function onList() { var h = location.hash || "#/pulse"; return LIST_ROUTES.test(h); }
  function read() {
    if (!onList() && last) return Promise.resolve({ ok: true, body: last, same: true });
    /* With a chain picked in the top bar, read that chain's own lists so its columns are full, not the slice
       of it that happens to sit in the all-chain lists. (Fable) */
    var c = chainId();
    return Promise.all([L.feed("trending", c), L.feed("new", c), L.feed("bonding", c), L.feed("migrated", c), L.launches()]).then(function (r) {
      var trend = r[0];
      var stand = trend.ok && !trend.tokens.length ? L.feed("volume", c) : Promise.resolve(null);
      return stand.then(function (v) {
        var lists = { trending: v && v.ok ? v.tokens : trend.tokens, trendingStandIn: !!(v && v.ok), newPairs: r[1].tokens, bonding: r[2].tokens, migrated: r[3].tokens, launches: r[4].tokens };
        var ok = r.some(function (x) { return x.ok; }), obs = 0;
        r.concat(v ? [v] : []).forEach(function (x) { if (x.observedAt > obs) obs = x.observedAt; });
        var same = r.every(function (x) { return x.same; });
        last = { lists: lists, observedAt: obs, ok: ok };
        return { ok: ok, body: last, observedAt: obs, same: same };
      });
    });
  }
  function emit(res) {
    if (!res || !res.body) return;
    try { window.dispatchEvent(new CustomEvent("qhlive", { detail: res.body })); } catch (e) {}
    if (L.all().length) window.QH_LIVE_TOKENS = L.all();
    /* Discover draws once from whatever rows exist; on a direct load that is the sample set, so swap it for
       the live rows the first time they arrive. */
    var src = document.querySelector(".dc-page .dc-src");
    if (src && window.Discover && L.all().length >= 8 && !/^Live/.test(src.textContent)) window.Discover.render(src.closest(".dc-page").parentNode);
  }
  function start() {
    if (poller) { poller.now(); return; }
    poller = window.QHApi.poll(null, read, emit);
  }
  function latest() { return last; }
  window.addEventListener("hashchange", function () { if (poller && onList()) poller.now(); });
  L.start = start; L.latest = latest;
  start();
})();
