/* pf-live.js: the live Portfolio tabs Compare and Perpetuals. Written by Claude.
   Compare: two wallets side by side (value, 24h, PnL 7d / 30d / all, realized, unrealized, win rate) from
   /api/portfolio and /api/wallets/card, read once per wallet per visit (portfolio reads cost paid provider units).
   Perpetuals: Hyperliquid clearinghouseState for the connected or watched EVM address, read on open and on Refresh. */
window.PfLive = (function () {
  "use strict";
  var F = window.QHFmt, hold = {}, pair = { a: "", b: "" };
  function L() { return window.QHLive; }
  function valid(v) { return /^0x[0-9a-fA-F]{40}$/.test(v) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v); }
  function norm(v) { v = String(v || "").trim(); return /^0x/i.test(v) ? v.toLowerCase() : v; }
  /* Sub-cent PnL is dust: shown as $0 so a rounding residue never reads as a loss. */
  function cut(v) { return F.ok(v) && Math.abs(Number(v)) < 0.005 ? 0 : v; }
  function cls(v) { v = cut(v); return F.ok(v) && Number(v) !== 0 ? (Number(v) > 0 ? "pl-up" : "pl-dn") : ""; }
  function signed(v) { v = cut(v); return F.ok(v) ? (Number(v) > 0 ? "+" : "") + F.usd(v) : F.DASH; }
  function holdings(w) { if (!hold[w]) hold[w] = L().holdings(w).then(function (r) { if (!r.ok) delete hold[w]; return r; }); return hold[w]; }

  function readWallet(w) {
    var evm = L().family(w) === "evm", none = Promise.resolve({ ok: false });
    /* Cards first (fast index reads), then the slower balance read, so the browser's connection pool never starves them. */
    var cards = [evm ? L().card(w, "7d") : none, evm ? L().card(w, "30d") : none, evm ? L().card(w, "all") : none];
    return Promise.all(cards.concat([Promise.all(cards).then(function () { return holdings(w); })])).then(function (r) {
      r = [r[3], r[0], r[1], r[2]];
      var t = r[0].ok ? r[0].totals || {} : null;
      return { w: w, evm: evm, value: t ? t.valueUsd : null, ch24: t ? t.change24Usd : null, chains: t && t.byChain ? Object.keys(t.byChain).filter(function (k) { return F.n(t.byChain[k]) >= 0.01; }).length : null,
        d7: r[1].ok ? r[1].pnl : null, d30: r[2].ok ? r[2].pnl : null, all: r[3].ok ? r[3] : null };
    });
  }
  var ROWS = [
    ["Total value", function (x) { return F.usd(x.value); }, function (x) { return x.value; }],
    ["24h", function (x) { return signed(x.ch24); }, function (x) { return x.ch24; }, true],
    ["Chains", function (x) { return x.chains == null ? F.DASH : String(x.chains); }],
    ["PnL 7d", function (x) { return signed(x.d7); }, function (x) { return x.d7; }, true],
    ["PnL 30d", function (x) { return signed(x.d30); }, function (x) { return x.d30; }, true],
    ["PnL all time", function (x) { return signed(x.all && x.all.pnl); }, function (x) { return x.all && x.all.pnl; }, true],
    ["Realized", function (x) { return signed(x.all && x.all.realized); }, function (x) { return x.all && x.all.realized; }, true],
    ["Unrealized", function (x) { return signed(x.all && x.all.unrealized); }, function (x) { return x.all && x.all.unrealized; }, true],
    ["Win rate", function (x) { return x.all && x.all.counted ? F.pct(x.all.winRate * 100) : F.DASH; }, function (x) { return x.all && x.all.counted ? x.all.winRate : null; }],
    ["Tokens traded", function (x) { return x.all ? String(x.all.counted) : F.DASH; }, function (x) { return x.all ? x.all.counted : null; }]
  ];

  function compare(root) {
    if (!pair.a) pair.a = L().wallet() || "";
    root.innerHTML = '<div class="pl-card"><div class="pl-h">Compare two wallets</div><form class="pl-form"><input class="pl-in" name="a" placeholder="First wallet, 0x... or Solana" value="' + F.esc(pair.a) + '" spellcheck="false" autocomplete="off">' +
      '<input class="pl-in" name="b" placeholder="Second wallet" value="' + F.esc(pair.b) + '" spellcheck="false" autocomplete="off"><button class="pl-go">Compare</button></form><div class="pl-msg"></div><div class="pl-out"></div></div>';
    var out = root.querySelector(".pl-out"), msg = root.querySelector(".pl-msg");
    function run() {
      if (!pair.a || !pair.b) { out.innerHTML = '<div class="pl-note">Paste two addresses to see value, PnL and win rate side by side. Live numbers, read once.</div>'; return; }
      out.innerHTML = '<div class="pl-note">Reading both wallets</div>';
      Promise.all([readWallet(pair.a), readWallet(pair.b)]).then(function (xs) {
        if (!out.isConnected) return;
        out.innerHTML = '<div class="pl-cmp"><div class="pl-row pl-th"><span></span>' + xs.map(function (x) { return '<a href="#/wallet/' + encodeURIComponent(x.w) + '">' + F.esc(F.short(x.w)) + "</a>"; }).join("") + "</div>" +
          ROWS.map(function (r) {
            var v = r[2] ? xs.map(function (x) { return F.n(r[2](x)); }) : [NaN, NaN], lead = isFinite(v[0]) && isFinite(v[1]) && v[0] !== v[1] ? (v[0] > v[1] ? 0 : 1) : -1;
            return '<div class="pl-row"><span class="pl-k">' + r[0] + "</span>" + xs.map(function (x, i) {
              return '<b class="' + (r[3] ? cls(r[2](x)) : "") + (i === lead ? " pl-lead" : "") + '">' + r[1](x) + "</b>";
            }).join("") + "</div>";
          }).join("") + '</div><div class="pl-note">PnL and win rate cover QHooks markets on EVM chains. The higher value in each row is marked.</div>';
      });
    }
    root.querySelector(".pl-form").onsubmit = function (e) {
      e.preventDefault();
      var a = norm(this.a.value), b = norm(this.b.value);
      if (!valid(a) || !valid(b)) { msg.textContent = "Both need to be wallet addresses."; return; }
      msg.textContent = ""; pair.a = a; pair.b = b; run();
    };
    run();
  }

  function perps(root) {
    var w = L().wallet(), evm = w && L().family(w) === "evm";
    root.innerHTML = '<div class="pl-card"><div class="pl-h">Perpetuals on Hyperliquid <span class="pl-fresh"></span>' + (evm ? '<button class="pl-btn pl-ref">Refresh</button>' : "") + '</div><div class="pl-out"></div></div>';
    var out = root.querySelector(".pl-out");
    if (!evm) {
      out.innerHTML = '<div class="pl-note">' + (w ? "Hyperliquid accounts are EVM addresses. " : "") + 'Connect or watch an EVM wallet to see its open positions.</div><form class="pl-form"><input class="pl-in" name="a" placeholder="0x... address to watch" spellcheck="false"><button class="pl-go">Watch</button></form>';
      out.querySelector(".pl-form").onsubmit = function (e) { e.preventDefault(); var v = norm(this.a.value); if (/^0x[0-9a-f]{40}$/.test(v)) { L().watch(v); perps(root); } };
      return;
    }
    function draw(fresh) {
      out.innerHTML = '<div class="pl-note">Reading positions</div>';
      L().perps(w, fresh).then(function (r) {
        if (!out.isConnected) return;
        if (!r.ok) { out.innerHTML = '<div class="pl-note">Hyperliquid did not answer. Refresh to try again.</div>'; return; }
        root.querySelector(".pl-fresh").textContent = F.fresh(r.at);
        var up = 0; r.rows.forEach(function (p) { up += p.upnl || 0; });
        out.innerHTML = '<div class="pl-stats">' + [["Account value", F.usd(r.value)], ["Open notional", F.usd(r.notional)], ["Margin used", F.usd(r.margin)], ["Withdrawable", F.usd(r.withdrawable)], ["Unrealized PnL", signed(up), cls(up)]].map(function (s) {
          return '<div class="pl-stat"><div class="pl-k">' + s[0] + '</div><div class="pl-v ' + (s[2] || "") + '">' + s[1] + "</div></div>";
        }).join("") + "</div>" +
          (r.rows.length ? '<div class="pl-pos pl-th"><span>Market</span><span>Size</span><span>Entry</span><span>Value</span><span>PnL (ROE)</span><span>Liq.</span></div>' + r.rows.map(function (p) {
            return '<div class="pl-pos"><span><b>' + F.esc(p.coin) + '</b> <i class="' + (p.side === "Long" ? "pl-up" : "pl-dn") + '">' + p.side + (p.lev ? " " + p.lev + "x" : "") + "</i></span><span>" + F.num(p.size) + "</span><span>" + F.price(p.entry) + "</span><span>" + F.usd(p.value) +
              '</span><span class="' + cls(p.upnl) + '">' + signed(p.upnl) + " (" + F.pct((p.roe || 0) * 100, true) + ")</span><span>" + F.price(p.liq) + "</span></div>";
          }).join("") : '<div class="pl-note">No open perpetual positions for ' + F.esc(F.short(w)) + '. <a href="#/perps">Open Perps</a></div>');
      });
    }
    root.querySelector(".pl-ref").onclick = function () { draw(true); };
    draw();
  }

  var css = document.createElement("style");
  css.textContent = ".pl-card{background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}" +
    ".pl-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}.pl-fresh{font-size:11px;color:var(--mut);font-weight:400;margin-left:auto}" +
    ".pl-form{display:flex;gap:8px;flex-wrap:wrap}.pl-in{flex:1 1 240px;min-width:0;height:36px;background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--tx);padding:0 10px;font-size:13px}" +
    ".pl-go,.pl-btn{height:36px;padding:0 14px;border:1px solid var(--line);background:var(--s2);color:var(--tx);border-radius:4px;font-size:12px;cursor:pointer}.pl-go{background:var(--up);color:#04140c;border-color:var(--up);font-weight:600}" +
    ".pl-msg{font-size:12px;color:var(--acc);min-height:0}.pl-note{font-size:12px;color:var(--mut)}.pl-note a{color:var(--acc)}" +
    ".pl-cmp{border:1px solid var(--line);border-radius:6px;overflow:hidden}.pl-row{display:grid;grid-template-columns:minmax(0,1.2fr) 1fr 1fr;gap:8px;align-items:center;min-height:36px;padding:0 10px;border-top:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".pl-row>b,.pl-row>a{text-align:right;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pl-th{border-top:0;color:var(--mut)}.pl-th a{color:var(--tx);text-decoration:none;font-family:ui-monospace,monospace}" +
    ".pl-k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.pl-lead{box-shadow:inset -2px 0 0 var(--acc);padding-right:6px}.pl-up{color:var(--up)}.pl-dn{color:var(--dn)}" +
    ".pl-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.pl-stat{background:var(--s2);border-radius:6px;padding:10px;min-width:0}.pl-v{font-size:16px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".pl-pos{display:grid;grid-template-columns:minmax(0,1.3fr) .8fr 1fr 1fr 1.3fr 1fr;gap:8px;align-items:center;min-height:36px;padding:0 4px;border-top:1px solid var(--line);font-size:12px;font-variant-numeric:tabular-nums}" +
    ".pl-pos>span{text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pl-pos>span:first-child{text-align:left}.pl-pos i{font-style:normal;font-size:11px}" +
    "@media (max-width:767px){.pl-note a{display:inline-flex;align-items:center;min-height:44px}.pl-stats{grid-template-columns:1fr 1fr}.pl-in,.pl-go,.pl-btn{height:44px}.pl-row{min-height:44px}.pl-pos{grid-template-columns:minmax(0,1.2fr) 1fr 1.3fr;min-height:44px}.pl-pos>*:nth-child(2),.pl-pos>*:nth-child(3),.pl-pos>*:nth-child(6){display:none}}";
  document.head.appendChild(css);
  return { compare: compare, perps: perps };
})();
