/* Perps trading screen (#/perps): market rail, live Hyperliquid candles, order book, trade tape, liquidity map, order panel.
   This file loads the perps modules, lays out the screen and switches markets. One shared WS (perps-feed.js). Written by Claude. */
window.Perps = (function () {
  "use strict";
  var MODS = ["perps-feed.js", "perps-css.js", "perps-markets.js", "perps-chart.js", "perps-book.js", "perps-tape.js", "perps-map.js", "perps-order.js"];
  var loaded = false, loading = null, coin = "", H = {}, ctxCoin = "";

  function loadAll() {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = MODS.reduce(function (p, f) {
      return p.then(function () {
        return new Promise(function (ok, bad) {
          var s = document.createElement("script"); s.src = "js/" + f; s.onload = ok;
          s.onerror = function () { bad(new Error("Could not load " + f)); }; document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { loaded = true; });
    return loading;
  }
  function stat(label, cls) {
    var w = document.createElement("div"); w.className = "pph-st";
    var l = document.createElement("span"); l.textContent = label; var v = document.createElement("b"); v.className = cls || ""; v.textContent = "—";
    w.appendChild(l); w.appendChild(v); H.stats.appendChild(w); return v;
  }
  function paintCtx(ctx) {
    var F = window.PerpsFeed; if (!ctx) return;
    var mark = F.num(ctx.markPx), prev = F.num(ctx.prevDayPx), ch = (mark - prev) / prev * 100;
    window.PerpsState.mark = mark;
    H.px.textContent = F.px(mark);
    H.ch.textContent = F.pct(ch); H.ch.className = isFinite(ch) ? (ch >= 0 ? "up" : "dn") : "";
    H.oracle.textContent = F.px(ctx.oraclePx);
    H.vol.textContent = F.usd(ctx.dayNtlVlm);
    H.oi.textContent = F.usd(F.num(ctx.openInterest) * mark);
    var fr = F.num(ctx.funding) * 100; H.fund.textContent = isFinite(fr) ? (fr >= 0 ? "" : "−") + Math.abs(fr).toFixed(4) + "%" : F.DASH;
    H.fund.className = fr >= 0 ? "up" : "dn";
  }
  function tickHeader() {
    var F = window.PerpsFeed;
    H.live.textContent = F.liveText();
    var now = new Date(), left = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());
    H.next.textContent = ("0" + Math.floor(left / 60)).slice(-2) + ":" + ("0" + (left % 60)).slice(-2);
  }
  function pick(c, inf) {
    var F = window.PerpsFeed;
    if (c === coin) return;
    if (coin) { F.unsub({ type: "l2Book", coin: coin }); F.unsub({ type: "trades", coin: coin }); F.unsub({ type: "activeAssetCtx", coin: coin }); }
    coin = c; ctxCoin = c; window.PerpsState.coin = c; window.PerpsState.last = NaN; window.PerpsState.mid = NaN;
    try { localStorage.setItem("qh-perps-coin", c); } catch (x) {}
    H.sym.textContent = c + "-PERP"; H.lev.textContent = (inf.maxLev || 20) + "x max";
    H.px.textContent = F.DASH;
    if (inf.ctx) paintCtx(inf.ctx);
    F.sub({ type: "l2Book", coin: c }); F.sub({ type: "trades", coin: c }); F.sub({ type: "activeAssetCtx", coin: c });
    window.PerpsChart.setCoin(c, inf); window.PerpsBook.setCoin(c, inf); window.PerpsTape.setCoin(c, inf);
    window.PerpsMap.setCoin(c, inf); window.PerpsOrder.setCoin(c, inf);
  }
  function part(cls) { var d = document.createElement("section"); d.className = "pz-panel " + cls; return d; }
  function build(root) {
    var F = window.PerpsFeed;
    F.stop(); F.start(); coin = "";
    window.PerpsState = { walls: [] };
    root.textContent = "";
    var term = F.el("div", "pz-term");
    var rail = part("pz-rail"), head = F.el("header", "pz-headr"), chart = part("pz-chart"), map = part("pz-map");
    var book = part("pz-book"), tape = part("pz-tape"), order = part("pz-order");
    var tabs = F.el("div", "pz-tabs");
    [["book", "Book"], ["tape", "Trades"], ["map", "Liquidity"]].forEach(function (t, i) {
      var b = F.el("button", "pz-tab" + (i ? "" : " on"), t[1]); b.type = "button";
      b.addEventListener("click", function () {
        term.setAttribute("data-tab", t[0]); tabs.querySelectorAll(".pz-tab").forEach(function (x) { x.classList.toggle("on", x === b); });
        if (window.PerpsState.redrawChart) window.PerpsState.redrawChart();
      });
      tabs.appendChild(b);
    });
    term.setAttribute("data-tab", "book");
    [rail, head, chart, tabs, map, book, tape, order].forEach(function (x) { term.appendChild(x); });
    root.appendChild(term);
    H = {};
    var id = F.el("div", "pph-id"); H.sym = F.el("span", "pph-sym", "—"); H.lev = F.el("span", "pph-lev", ""); id.appendChild(H.sym); id.appendChild(H.lev);
    H.px = F.el("span", "pph-px", "—");
    H.stats = F.el("div", "pph-stats");
    head.appendChild(id); head.appendChild(H.px); head.appendChild(H.stats);
    H.ch = stat("24h change"); H.oracle = stat("Oracle"); H.vol = stat("24h volume"); H.oi = stat("Open interest");
    H.fund = stat("Funding 1h"); H.next = stat("Next funding");
    H.live = F.el("span", "pph-live", "Connecting"); head.appendChild(H.live);
    window.PerpsChart.mount(chart); window.PerpsBook.mount(book); window.PerpsTape.mount(tape);
    window.PerpsMap.mount(map); window.PerpsOrder.mount(order);
    F.on("activeAssetCtx", function (d) { if (d && d.coin === ctxCoin) paintCtx(d.ctx); });
    var saved = "BTC"; try { saved = localStorage.getItem("qh-perps-coin") || "BTC"; } catch (x) {}
    window.PerpsMarkets.mount(rail, { coin: saved, onPick: pick });
    tickHeader(); F.every(tickHeader, 1000);
  }
  function render(root) {
    var holder = document.createElement("div"); holder.className = "pz-msg"; holder.textContent = "Loading perps";
    root.appendChild(holder);
    loadAll().then(function () { if (root.isConnected || root.parentNode) build(root); }).catch(function (e) {
      holder.textContent = "Perps did not load: " + e.message + " ";
      var b = document.createElement("button"); b.className = "pz-retry"; b.textContent = "Retry"; b.type = "button";
      b.addEventListener("click", function () { location.reload(); }); holder.appendChild(b);
    });
  }
  return { render: render };
})();
