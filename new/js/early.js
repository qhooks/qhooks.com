/* early.js: start the first market reads before the rest of the scripts load. Written by Fable (speed).
   Loaded from <head> as a plain (not async) script so it always runs before the app scripts; it is tiny and
   arrives with the stylesheets. On a list route it fires the same five requests live-boot.js will ask for and
   parks the promises on window.__QH_EARLY; QHApi.get() takes each one once. The data round trip then runs
   alongside script download and parse instead of after it. Same URLs, same headers, no extra requests. */
(function () {
  "use strict";
  if (window.QHApi) return; /* the app already started its own reads; never ask twice */
  var h = location.hash || "#/pulse";
  if (!/^#\/(pulse|discover|community|more)?($|[/?])/.test(h)) return;
  var IDS = { Robinhood: "4663", Base: "8453", Solana: "solana", BNB: "56", Ethereum: "1", Arbitrum: "42161", Elysium: "99901" }, c = "all";
  try { c = IDS[localStorage.getItem("qh-chain") || ""] || "all"; } catch (e) {}
  var base = typeof window.QH_API === "string" ? window.QH_API : "", out = {};
  function go(path) {
    var t0 = Date.now();
    out[base + path] = fetch(base + path, { headers: { accept: "application/json" }, cache: "no-store" }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (b) {
        return { ok: r.ok, status: r.status, etag: r.headers.get("etag") || "", obs: Number(r.headers.get("x-qhooks-observed-at")) || 0, body: b, ms: Date.now() - t0 };
      });
    }).catch(function () { return null; });
  }
  ["trending", "new", "bonding", "migrated"].forEach(function (tab) { go("/api/terminal/market/feed?tab=" + tab + "&chain=" + encodeURIComponent(c) + "&window=24h"); });
  go("/api/terminal/feed?chain=all");
  window.__QH_EARLY = out;
})();
