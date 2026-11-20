/* live-wallet.js: one live wallet view used by #/wallet/<address> and by Portfolio (the visitor's wallet).
   Reads /api/portfolio/<evm|solana>/<w> (balances and values on every chain, QHooks cost basis),
   /api/terminal/activity?w= (trades on QHooks markets) once per visit; Refresh reads again. No timers,
   because portfolio reads cost the site paid provider units. Written by Claude. */
(function () {
  "use strict";
  var F = window.QHFmt, N = window.QHNorm;

  function cls(v) { return F.ok(v) && Number(v) !== 0 ? (Number(v) > 0 ? "lw-up" : "lw-dn") : ""; }
  function card(k, v, c) { return '<div class="lw-card"><div class="lw-k">' + k + '</div><div class="lw-v ' + (c || "") + '">' + v + "</div></div>"; }
  function holdRow(h, canSell) {
    var name = h.href ? '<a href="' + F.esc(h.href) + '">' + F.esc(h.symbol) + "</a>" : F.esc(h.symbol);
    return '<div class="lw-tr"><span class="lw-tok">' + (h.logo ? '<img src="' + F.esc(h.logo) + '" alt="">' : '<i>' + F.esc(String(h.symbol || "?").charAt(0)) + "</i>") +
      "<b>" + name + '</b><em>' + F.esc(h.chain) + "</em></span><span>" + F.num(h.amount) + "</span><span>" + F.usd(h.value) + "</span>" +
      '<span class="' + cls(h.change) + '">' + F.pct(h.change, true) + '</span><span class="' + cls(h.pnl) + '">' + (h.pnl == null ? F.DASH : F.usd(h.pnl)) + "</span>" +
      (canSell && h.href && !h.native ? '<a class="lw-sell" href="' + F.esc(h.href) + '">Sell</a>' : "<span></span>") + "</div>";
  }
  function tradeRow(t) {
    return '<div class="lw-tr lw-act"><span>' + F.age((Date.now() - t.time) / 1000) + '</span><span class="' + (t.side === "buy" ? "lw-up" : "lw-dn") + '">' + (t.side === "buy" ? "Buy" : "Sell") + "</span>" +
      '<span><a href="' + F.esc(t.href) + '">' + F.esc(t.symbol) + "</a></span><span>" + F.num(t.amount) + "</span><span>" + F.num(t.paid) + " " + F.esc(t.quoteSymbol) + "</span>" +
      "<span>" + (t.usd == null ? F.DASH : F.usd(t.usd)) + "</span><span>" + (t.txUrl ? '<a href="' + F.esc(t.txUrl) + '" target="_blank" rel="noopener">Tx</a>' : "") + "</span></div>";
  }

  /* opts: mine (Portfolio), embedded (the profile page draws its own header and cards), onTotals.
     Sell buttons show only when this wallet is the one connected in the browser. */
  function render(root, w, opts) {
    opts = opts || {};
    var L = window.QHLive, canSell = !!(L.connected && L.connected() && L.connected() === String(w).toLowerCase()), shown = 20, trades = null;
    var head = opts.embedded ? "" : '<div class="lw-head q-wallet-header"><div><div class="lw-k">' + (opts.mine ? "Your wallet" : "Wallet") + '</div><div class="lw-addr">' + F.esc(w) + "</div></div>" +
      '<div class="lw-actions"><span class="lw-fresh">Reading balances</span><button class="lw-btn lw-refresh">Refresh</button>' + (opts.extra || "") + "</div></div>" +
      '<div class="lw-cards">' + card("Total value", F.DASH) + card("24h", F.DASH) + card("QHooks PnL", F.DASH) + card("Chains", F.DASH) + "</div><div class=\"lw-chains\"></div>";
    root.innerHTML = '<div class="lw-wrap' + (opts.embedded ? " lw-emb" : "") + '">' + head + '<h3 class="lw-h">Holdings</h3><div class="lw-table lw-hold"><div class="lw-tr lw-th"><span>Token</span><span>Amount</span><span>Value</span><span>24h</span><span>PnL</span><span></span></div><div class="lw-body"><div class="lw-note">Reading balances on every chain</div></div></div>' +
      '<h3 class="lw-h">Trades on QHooks</h3><div class="lw-table lw-trades"><div class="lw-tr lw-th lw-act"><span>Age</span><span>Side</span><span>Token</span><span>Amount</span><span>Paid / got</span><span>USD</span><span></span></div><div class="lw-body"><div class="lw-note">Reading trades</div></div></div><div class="lw-more-wrap"></div></div>';
    function q(sel) { return root.querySelector(sel); }
    function fresh(t) { var el = q(".lw-fresh"); if (el) el.textContent = t; }
    function drawTrades() {
      var el = q(".lw-trades .lw-body"), more = q(".lw-more-wrap");
      el.innerHTML = trades.length ? trades.slice(0, shown).map(tradeRow).join("") : '<div class="lw-note">No trades on QHooks markets yet.</div>';
      more.innerHTML = trades.length > shown ? '<button class="lw-btn lw-more">Show more (' + (trades.length - shown) + ")</button>" : "";
      var b = q(".lw-more"); if (b) b.onclick = function () { shown += 20; drawTrades(); };
    }
    function load(again) {
      fresh("Refreshing");
      L.holdings(w, again).then(function (r) {
        var body = q(".lw-hold .lw-body");
        if (!r.ok) { body.innerHTML = '<div class="lw-note">Balances are unavailable right now. Refresh to try again.</div>'; fresh(F.DASH); if (opts.onTotals) opts.onTotals(null); return; }
        var list = r.rows, tot = r.totals || {}, pnl = 0, any = false;
        list.forEach(function (h) { if (h.pnl != null) { pnl += h.pnl; any = true; } });
        var by = tot.byChain || {}, ids = Object.keys(by).filter(function (k) { return F.n(by[k]) >= 0.01; }).sort(function (a, c) { return by[c] - by[a]; });
        if (!opts.embedded) {
          q(".lw-cards").innerHTML = card("Total value", F.usd(tot.valueUsd)) + card("24h", (F.n(tot.change24Usd) > 0 ? "+" : "") + F.usd(tot.change24Usd), cls(tot.change24Usd)) +
            card("QHooks PnL", any ? (pnl > 0 ? "+" : "") + F.usd(pnl) : F.DASH, cls(any ? pnl : null)) + card("Chains", String(ids.length));
          q(".lw-chains").innerHTML = ids.map(function (k) { return '<span class="lw-chip">' + F.esc(N.chain(k).name) + " <b>" + F.usd(by[k]) + "</b></span>"; }).join("");
        }
        body.innerHTML = list.length ? list.map(function (h) { return holdRow(h, canSell); }).join("") : '<div class="lw-note">No priced holdings on the chains QHooks reads.</div>';
        fresh(F.fresh(r.at));
        if (opts.onTotals) opts.onTotals(tot, ids);
      });
      if (L.family(w) !== "evm") { q(".lw-trades .lw-body").innerHTML = '<div class="lw-note">QHooks trade history covers EVM wallets.</div>'; return; }
      L.trades(w).then(function (r) {
        if (!r.ok) { q(".lw-trades .lw-body").innerHTML = '<div class="lw-note">Trades are unavailable right now.</div>'; return; }
        trades = r.rows;
        return Promise.all(trades.map(function (t) { return L.usdOf ? L.usdOf(t.paid, t.quoteSymbol) : null; })).then(function (u) {
          trades.forEach(function (t, i) { t.usd = u[i]; }); drawTrades();
          if (opts.onTrades) opts.onTrades(trades);
        });
      });
    }
    var rb = q(".lw-refresh"); if (rb) rb.onclick = function () { load(true); };
    load();
    return { reload: load };
  }

  var css = document.createElement("style");
  css.textContent = ".lw-wrap{padding:12px 16px;max-width:1200px;margin:0 auto}.lw-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}" +
    ".lw-k{font-size:11px;letter-spacing:.06em;color:var(--mut);text-transform:uppercase}.lw-addr{font-size:13px;font-family:ui-monospace,monospace;word-break:break-all}" +
    ".lw-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lw-fresh{font-size:11px;color:var(--mut)}.lw-btn{height:32px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;padding:0 10px;cursor:pointer;font-size:12px}" +
    ".lw-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.lw-card{background:var(--s1);border:1px solid var(--line);border-radius:6px;padding:10px}.lw-v{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:4px}" +
    ".lw-chains{display:flex;gap:6px;flex-wrap:wrap}.lw-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:4px;padding:3px 6px}.lw-chip b{color:var(--tx)}" +
    ".lw-h{font-size:13px;margin:16px 0 6px}.lw-table{background:var(--s1);border:1px solid var(--line);border-radius:6px;overflow:hidden}" +
    ".lw-tr{display:grid;grid-template-columns:minmax(0,2fr) 1fr 1fr .8fr 1fr 56px;gap:8px;align-items:center;min-height:40px;padding:0 10px;border-top:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".lw-tr>span{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lw-tr>span:first-child{text-align:left}.lw-th{border-top:0;min-height:30px;color:var(--mut);font-size:11px}" +
    ".lw-tok{display:flex;align-items:center;gap:6px}.lw-tok img,.lw-tok i{width:22px;height:22px;border-radius:4px;object-fit:cover;background:var(--s2);font-style:normal;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--mut)}" +
    ".lw-tok em{font-style:normal;color:var(--mut);font-size:10px}.lw-tr a{color:var(--tx);text-decoration:none}.lw-act{grid-template-columns:56px 50px minmax(0,1fr) 1fr 1fr .8fr 40px}.lw-more-wrap{display:flex;justify-content:center;margin-top:8px}.lw-more{min-width:160px}.lw-emb{padding:0;max-width:none}" +
    ".lw-sell{border:1px solid var(--dn);color:var(--dn)!important;border-radius:4px;text-align:center;height:28px;line-height:26px}" +
    ".lw-note{padding:14px 10px;color:var(--mut);font-size:12px}.lw-up{color:var(--up)}.lw-dn{color:var(--dn)}" +
    "@media (max-width:767px){.lw-cards{grid-template-columns:1fr 1fr}.lw-tr{grid-template-columns:minmax(0,1.6fr) 1fr .8fr 52px}.lw-hold .lw-tr>*:nth-child(2),.lw-hold .lw-tr>*:nth-child(5){display:none}" +
    ".lw-act{grid-template-columns:40px 36px minmax(0,1fr) 1fr}.lw-act{grid-template-columns:40px 36px minmax(0,1fr) 1fr 1fr}.lw-act>*:nth-child(4),.lw-act>*:nth-child(7){display:none}.lw-btn{height:44px}.lw-sell{height:44px;line-height:42px}}";
  document.head.appendChild(css);
  window.QHWalletView = { render: render };
})();
