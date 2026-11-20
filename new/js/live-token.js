/* live-token.js: the token page on live data. Route #/token/<chain>/<address> (or #/token/<address> for a token
   already seen in a feed). Paints at once from what the feeds already read, then refreshes in place:
   token read every 10 s while visible (30 s when nothing changed), candles every 30 s (the route is cached 30 s).
   Fixture tokens (offline) keep the original page. Written by Claude. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;
  var TFS = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1D", 86400]];

  function parse(rest) {
    rest = String(rest || "").split("?")[0];
    var p = rest.split("/").map(function (x) { return decodeURIComponent(x); });
    if (p.length >= 2) return { chain: p[0], addr: p[1] };
    var t = window.QHLive.find(p[0]);
    if (t) return { chain: t.chainId, addr: t.address };
    return { chain: /^0x[0-9a-fA-F]{40}$/.test(p[0]) ? "4663" : "solana", addr: p[0], guess: /^0x[0-9a-fA-F]{40}$/.test(p[0]), tries: 0 };
  }
  function stat(k, v, cls) { return "<div class='token-stat'><div class='token-stat-label'>" + k + "</div><div class='token-stat-value " + (cls || "") + "'>" + v + "</div></div>"; }
  function stats(t) {
    var ch = t.change24, chc = F.ok(ch) && ch !== 0 ? (ch > 0 ? "dt-up" : "dt-dn") : "";
    return stat("Price", F.price(t.price)) + stat("MC", F.usd(t.mcap)) + stat("24h", F.pct(ch, true), chc) + stat("Liquidity", F.usd(t.liquidity)) +
      stat("24h Vol", F.usd(t.volume)) + stat("Buys / Sells", F.ok(t.buys) ? F.int(t.buys) + " / " + F.int(t.sells) : F.DASH) +
      stat("Holders", F.int(t.holders)) + stat("Top 10", F.pct(t.top10)) + (t.progress != null && t.stage !== "migrated" ? stat("Curve", F.pct(t.progress)) : "");
  }
  function header(t) {
    var av = t.logo ? "<img class='token-avatar lt-avatar' src='" + F.esc(t.logo) + "' alt=''>" : "<div class='token-avatar'>" + F.esc((t.symbol || "?").charAt(0)) + "</div>";
    var links = t.links || {}, soc = ["website", "x", "telegram"].filter(function (k) { return links[k]; }).map(function (k) {
      return "<a class='token-social' href='" + F.esc(links[k]) + "' target='_blank' rel='noopener'>" + (k === "x" ? "X" : k === "website" ? "Site" : "TG") + "</a>";
    }).join("");
    return "<div class='token-header'><div class='token-header-top'><div class='token-header-left'>" + av + "<div class='token-title'><span class='token-symbol'>" + F.esc(t.symbol || F.DASH) +
      "</span><span class='token-name'>" + F.esc(t.name || "") + "</span></div><div class='token-meta'><span class='token-age'>" + F.age(t.ageSec) + "</span> <span class='lt-chain'>" + F.esc(t.chain) +
      "</span> <span class='token-socials'>" + soc + "</span></div></div><div class='lt-head-q'>" + window.LiveTokenTabs.chip(t.qProof) + "</div><span class='lt-fresh'></span></div>" +
      "<div class='token-stats-row'>" + stats(t) + "</div></div>";
  }
  function shell(t) {
    return "<div class='token-page lt-page'><div class='token-main'>" + header(t) +
      "<div class='token-chart-section'><div class='token-chart-header'><div class='token-chart-tfs'>" + TFS.map(function (x, i) { return "<button class='token-tf-btn" + (i === 0 ? " active" : "") + "' data-tf='" + x[1] + "'>" + x[0] + "</button>"; }).join("") +
      "</div><button class='token-chart-mode' data-mode='price'>Price</button><span class='lt-chart-note'></span></div><div class='token-chart-container'><canvas class='token-canvas'></canvas></div></div>" +
      "<div class='token-tabs'><div class='token-tab active' data-tab='trades'>Trades</div><div class='token-tab' data-tab='holders'>Holders</div><div class='token-tab' data-tab='traders'>Top traders</div></div>" +
      "<div class='lt-tabbody'></div></div><div class='token-side'>" + window.Token.renderTradePanel(t) + "<section class='token-qproof lt-qproof'></section></div></div>";
  }

  function render(wrap, rest, fixtures) {
    var L = window.QHLive, where = parse(rest);
    var fx = (fixtures || []).find(function (x) { return (x.address || "").toLowerCase() === String(where.addr).toLowerCase(); });
    if (fx && !L.find(where.addr)) { window.Token.render(wrap, fx); if (window.TradeEstimate) window.TradeEstimate.attach(wrap, fx); return; }
    var t = L.find(where.chain, where.addr) || Object.assign(N.feedRow({ chainId: where.chain, token: { address: where.addr, symbol: "", name: "" } }), { kind: "pending" });
    wrap.innerHTML = shell(t);
    var main = wrap.querySelector(".token-main"), body = wrap.querySelector(".lt-tabbody"), canvas = wrap.querySelector("canvas");
    var tab = "trades", tstate = {}, tf = 60, bars = [], mc = false, loaded = false, side = null, autoTf = true;
    function paintHeader() {
      var row = main.querySelector(".token-stats-row"), html = stats(t);
      if (row && row.innerHTML !== html) row.innerHTML = html;
      var sy = main.querySelector(".token-symbol"); if (sy && t.symbol && sy.textContent !== t.symbol) { main.querySelector(".token-header").outerHTML = header(t); }
      var fr = main.querySelector(".lt-fresh"); if (fr) fr.textContent = loaded ? F.fresh(t.observedAt) : "";
    }
    function paintChart() {
      QHChart.draw(canvas, QHChart.tick(bars, t.price, tf), { mult: mc ? t.supply || (t.mcap && t.price ? t.mcap / t.price : 0) : 1, empty: loaded ? "No trades in this window yet" : "Reading chart" });
    }
    function paintTab() {
      if (tab === "trades") window.LiveTokenTabs.trades(body, t, tstate);
      else if (tab === "holders") window.LiveTokenTabs.holders(body, t);
      else window.LiveTokenTabs.traders(body, t);
    }
    function readBars() {
      return L.candles(t, tf).then(function (r) {
        bars = r.bars || [];
        /* Default timeframe: the shortest with about 40 moving bars, else 1h. Stops once the user picks one. (Fable) */
        if (autoTf) {
          var ix = 0; TFS.forEach(function (x, i) { if (x[1] === tf) ix = i; });
          if (QHChart.moving(bars) < 40 && ix < 3) { tf = TFS[ix + 1][1]; markTf(); return readBars(); }
          if (bars.length) autoTf = false;
        }
        var nt = wrap.querySelector(".lt-chart-note"); if (nt) nt.textContent = r.fromTrades ? "Built from recent trades" : "";
        paintChart(); return { ok: true, body: bars.length, same: false };
      });
    }
    function markTf() { wrap.querySelectorAll(".token-tf-btn").forEach(function (x) { x.classList.toggle("active", +x.dataset.tf === tf); }); }
    wrap.querySelectorAll(".token-tf-btn").forEach(function (b) {
      b.onclick = function () { autoTf = false; wrap.querySelectorAll(".token-tf-btn").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); tf = +b.dataset.tf; readBars(); };
    });
    var modeB = wrap.querySelector(".token-chart-mode");
    modeB.onclick = function () { mc = !mc; modeB.textContent = mc ? "MC" : "Price"; modeB.classList.toggle("active", mc); paintChart(); };
    wrap.querySelectorAll(".token-tab").forEach(function (b) {
      b.onclick = function () { wrap.querySelectorAll(".token-tab").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); tab = b.dataset.tab; tstate = {}; paintTab(); };
    });
    window.LiveTokenTabs.qproof(wrap.querySelector(".lt-qproof"), t);
    if (window.LiveTrade) side = window.LiveTrade.attach(wrap, t);
    paintHeader(); paintChart(); body.innerHTML = "<div class='token-no-data lt-note'>Reading trades</div>";
    var first = true;
    QHApi.poll(wrap, function () { return L.token(where.chain, where.addr); }, function (r) {
      if (!r.ok || !r.token) {
        /* Claude: a bare EVM address may live on another chain; try the next one before giving up */
        if (where.guess && where.tries < 5) { where.tries++; where.chain = ["4663", "8453", "42161", "56", "1", "99901"][where.tries]; return; }
        if (first) { body.innerHTML = "<div class='token-no-data lt-note'>This token is unavailable right now. QHooks will keep trying.</div>"; QHChart.draw(canvas, [], { empty: "Chart unavailable right now" }); }
        var fr = main.querySelector(".lt-fresh"); if (fr) fr.textContent = "Refreshing";
        return;
      }
      t = r.token; loaded = true;
      if (first) {
        first = false; wrap.querySelector(".token-header").outerHTML = header(t);
        if (t.kind === "qhooks") L.header(t).then(paintHeader);
        QHApi.poll(wrap, readBars, function () {}, { fast: 30000, slow: 60000 });
      }
      if (side) side.update(t);
      document.querySelectorAll(".fl-sticky .fl-btn").forEach(function (x, i) { var lb = (i ? "Sell " : "Buy ") + (t.symbol || "token"); if (x.textContent !== lb) x.textContent = lb; });
      paintHeader(); if (bars.length) paintChart();
      if (tab === "trades") paintTab(); else if (tab === "traders") paintTab();
    });
    var iv = setInterval(function () { if (!main.isConnected) { clearInterval(iv); return; } var fr = main.querySelector(".lt-fresh"); if (fr && loaded) fr.textContent = F.fresh(t.observedAt); }, 1000);
    var ro = new ResizeObserver(function () { if (canvas.isConnected) paintChart(); }); ro.observe(canvas.parentNode);
  }

  var css = document.createElement("style");
  css.textContent = ".lt-avatar{object-fit:cover;padding:0}.lt-chain{font-size:10px;border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--mut)}" +
    ".lt-fresh,.lt-chart-note{font-size:11px;color:var(--mut);margin-left:auto;white-space:nowrap}.lt-head-q{display:flex}.token-social{text-decoration:none}" +
    ".lt-page .token-stat-value.dt-up{color:var(--up)}.lt-page .token-stat-value.dt-dn{color:var(--dn)}" +
    ".pulse-qproof-partial{color:var(--acc);border-color:rgba(210,173,114,.3)}.lt-page .q-addr-link{white-space:nowrap}" +
    "@media (max-width:767px){.lt-page,.lt-page .token-main,.lt-page .token-header{max-width:100vw;min-width:0}.lt-page .token-stats-row{min-width:0;max-width:100%;overflow-x:auto;flex-wrap:nowrap}.lt-page{overflow-x:hidden}}";
  document.head.appendChild(css);
  window.LiveToken = { render: render, parse: parse };
})();
