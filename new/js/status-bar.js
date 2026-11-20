/* status-bar.js: desktop footer status bar (contract section 2). Written by Fable.
   Real values only: connection age and latency come from QHApi.status(); SOL, ETH and HYPE come from
   /api/funding/native-prices. Anything not yet read shows an em dash. Hidden under 768px. */
(function () {
  "use strict";
  var bar = null, prices = {}, pricesAt = 0;

  function cell(label, id) { return "<span class='sb-cell'><span class='sb-l'>" + label + "</span><b id='" + id + "'>\u2014</b></span>"; }
  function set(id, text, cls) { var e = document.getElementById(id); if (!e) return; if (e.textContent !== text) e.textContent = text; e.className = cls || ""; }

  function readPrices() {
    if (!window.QHApi || document.hidden || Date.now() - pricesAt < 60000) return;
    pricesAt = Date.now();
    window.QHApi.get("/api/funding/native-prices?symbols=ETH,SOL,BNB,HYPE").then(function (r) {
      if (r.ok && r.body && r.body.prices) prices = r.body.prices;
    });
  }

  function paint() {
    if (!bar || !window.QHApi || !window.QHApi.status) return;
    var s = window.QHApi.status(), F = window.QHFmt, age = s.okAt ? Math.round((Date.now() - s.okAt) / 1000) : -1;
    var live = age >= 0 && age < 30;
    set("sb-live", live ? "Live \u00b7 " + age + "s ago" : "Refreshing", live ? "sb-up" : "sb-wait");
    set("sb-ms", s.ms > 0 ? s.ms + " ms" : "\u2014");
    ["SOL", "ETH", "HYPE"].forEach(function (k) { var v = prices[k]; set("sb-" + k, v > 0 ? "$" + (v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2)) : "\u2014"); });
    readPrices();
  }

  function mount() {
    if (bar) return;
    bar = document.createElement("div"); bar.className = "sb-bar";
    bar.innerHTML = "<span class='sb-cell'><i class='sb-dot'></i><b id='sb-live'>Refreshing</b></span>" + cell("Latency", "sb-ms") +
      "<span class='sb-sp'></span>" + cell("SOL", "sb-SOL") + cell("ETH", "sb-ETH") + cell("HYPE", "sb-HYPE");
    document.body.appendChild(bar);
    paint(); setInterval(paint, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
